/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "odinscope.h"
#include "config-kwin.h"
#include "core/output.h"
#include "core/outputbackend.h"
#include "effect/effecthandler.h"
#include "input.h"
#include "main.h"
#include "wayland/clientconnection.h"
#include "wayland/pointerconstraints_v1.h"
#include "wayland/seat.h"
#include "wayland/subcompositor.h"
#include "wayland/surface.h"
#include "wayland/xdgshell.h"
#include "wayland_server.h"
#include "window.h"
#include "workspace.h"
#include <KPluginFactory>
#include <QDBusConnection>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <algorithm>
#include <cmath>
#include <limits>
#include <unistd.h>

namespace KWin
{
namespace
{
constexpr auto serviceName = "org.kde.KWin.OdinScope";
constexpr auto objectPath = "/org/kde/KWin/OdinScope";

bool exactHex(const QString &text, int size)
{
    static const QRegularExpression hex(QStringLiteral("^[a-f0-9]+$"));
    return text.size() == size && hex.match(text).hasMatch();
}

bool boundedText(const QString &text)
{
    if (text.size() > 4096 || text.contains(QChar::Null)) {
        return false;
    }
    for (qsizetype i = 0; i < text.size(); ++i) {
        const QChar c = text.at(i);
        if (c.isHighSurrogate()) {
            if (i + 1 >= text.size() || !text.at(i + 1).isLowSurrogate()) return false;
            ++i;
        } else if (c.isLowSurrogate()) {
            return false;
        }
    }
    return true;
}

SurfaceInterface *rootSurface(SurfaceInterface *surface)
{
    for (int depth = 0; surface && surface->subSurface() && depth < 64; ++depth) {
        surface = surface->subSurface()->parentSurface();
    }
    return surface;
}

bool intersects(const RectF &a, const RectF &b)
{
    return a.x() < b.x() + b.width() && b.x() < a.x() + a.width()
        && a.y() < b.y() + b.height() && b.y() < a.y() + a.height();
}

bool eligibleWindow(Window *window)
{
    return window && window->surface() && window->isShown() && !window->isMinimized()
        && !window->isDeleted() && !window->isInternal() && !window->isLockScreen()
        && !window->isLockScreenOverlay() && !window->isInputMethod() && !window->isOutline()
        && window->isOnCurrentDesktop() && window->isOnCurrentActivity()
        && !window->isInteractiveMove() && !window->isInteractiveResize()
        && (window->isNormalWindow() || window->isDialog() || window->isUtility()
            || window->isMenu() || window->isDropdownMenu() || window->isPopupMenu()
            // KWin assigns WindowType::Unknown to ordinary XdgPopupWindow.
            || (window->isPopupWindow() && window->surface()->role() == XdgPopupInterface::role()));
}

bool unconstrained(SurfaceInterface *surface)
{
    return surface && !(surface->lockedPointer() && surface->lockedPointer()->isLocked())
        && !(surface->confinedPointer() && surface->confinedPointer()->isConfined());
}

// KWin's XdgPopupWindow::initialize derives transientFor directly from the
// xdg_popup parent wl_surface. Never infer this relation from a title, app ID,
// PID alone, or a client-provided menu window-type hint.
bool popupBelongsTo(Window *target, Window *application, ClientConnection *client)
{
    Window *cursor = target;
    for (int depth = 0; cursor != application && depth < 64; ++depth) {
        if (!eligibleWindow(cursor) || !cursor->hasPopupGrab()
            || cursor->surface()->role() != XdgPopupInterface::role()
            || cursor->surface()->client() != client || cursor->pid() != client->processId()
            || !unconstrained(cursor->surface())) return false;
        cursor = cursor->transientFor();
    }
    return cursor == application;
}

QString normalizedBackendClass()
{
    const OutputBackend *backend = kwinApp() ? kwinApp()->outputBackend() : nullptr;
    if (!backend) {
        return {};
    }
    const QString name = QString::fromLatin1(backend->metaObject()->className());
    if (name == QLatin1String("KWin::DrmBackend")) return QStringLiteral("KWinDrmBackend");
    if (name == QLatin1String("KWin::VirtualBackend")) return QStringLiteral("KWinVirtualBackend");
    if (name == QLatin1String("KWin::X11WindowedBackend")) return QStringLiteral("KWinX11Backend");
    if (name == QLatin1String("KWin::Wayland::WaylandBackend")) return QStringLiteral("KWinWaylandBackend");
    return {};
}

quint64 randomToken()
{
    const quint64 token = QRandomGenerator::system()->generate64();
    return token == 0 ? 1 : token;
}
}

OdinScope::OdinScope()
{
    m_focusToken = randomToken();
    if (waylandServer() && waylandServer()->seat()) {
        connect(waylandServer()->seat(), &SeatInterface::focusedKeyboardSurfaceAboutToChange,
                this, [this](SurfaceInterface *) {
            ++m_focusSerial;
            m_focusToken = randomToken();
        });
    }
    if (workspace()) {
        connect(workspace(), &Workspace::windowActivated, this, [this] {
            ++m_focusSerial;
            m_focusToken = randomToken();
        });
    }
    QDBusConnection bus = QDBusConnection::sessionBus();
    m_registeredObject = bus.registerObject(QString::fromLatin1(objectPath), this,
                                             QDBusConnection::ExportScriptableSlots);
    m_registeredService = m_registeredObject && bus.registerService(QString::fromLatin1(serviceName));
    if (!m_registeredService && m_registeredObject) {
        bus.unregisterObject(QString::fromLatin1(objectPath));
        m_registeredObject = false;
    }
}

OdinScope::~OdinScope()
{
    QDBusConnection bus = QDBusConnection::sessionBus();
    if (m_registeredService) bus.unregisterService(QString::fromLatin1(serviceName));
    if (m_registeredObject) bus.unregisterObject(QString::fromLatin1(objectPath));
}

QString OdinScope::unavailable()
{
    if (calledFromDBus()) {
        sendErrorReply(QStringLiteral("org.kde.KWin.OdinScope.Unavailable"),
                       QStringLiteral("wayland_scope_unavailable"));
    }
    return {};
}

QString OdinScope::Identity(const QString &challenge)
{
    if (!m_registeredService || !exactHex(challenge, 48) || !kwinApp() || !waylandServer()) return unavailable();
    const QString backendClass = normalizedBackendClass();
    if (backendClass.isEmpty()) return unavailable();
    const QJsonObject result{{"challenge", challenge}, {"native_wayland", true},
        {"compositor_name", "kwin_wayland"},
        {"compositor_version", QString::fromLatin1(KWIN_VERSION_STRING)},
        {"backend_class", backendClass},
        {"backend", backendClass == QLatin1String("KWinX11Backend") ? "x11-nested" : "native"}};
    return QString::fromUtf8(QJsonDocument(result).toJson(QJsonDocument::Compact));
}

QString OdinScope::Snapshot(const QString &requestText)
{
    if (!m_registeredService || requestText.size() > 4096 || !kwinApp() || !workspace()
        || !waylandServer() || !input()) return unavailable();
    QJsonParseError error;
    const QJsonDocument document = QJsonDocument::fromJson(requestText.toUtf8(), &error);
    if (error.error != QJsonParseError::NoError || !document.isObject()) return unavailable();
    const QJsonObject request = document.object();
    const QString challenge = request.value("challenge").toString();
    const QString digest = request.value("source_digest").toString();
    if (request.value("protocol").toInt(-1) != 1 || !exactHex(challenge, 48)
        || !exactHex(digest, 64) || !request.value("source").isObject()) return unavailable();
    const QJsonObject source = request.value("source").toObject();
    const QJsonArray position = source.value("position").toArray();
    const QJsonArray size = source.value("size").toArray();
    const qint64 node = source.value("node_id").toInteger(-1);
    const QString handle = source.value("session_handle").toString();
    static const QRegularExpression path(QStringLiteral("^/(?:[A-Za-z0-9_]+/)*[A-Za-z0-9_]+$"));
    if (node <= 0 || node >= (qint64(1) << 32) || source.value("source_type").toInt(-1) != 1
        || handle.size() > 512 || !path.match(handle).hasMatch()
        || position.size() != 2 || size.size() != 2) return unavailable();
    const qint64 sx = position[0].toInteger(std::numeric_limits<qint64>::min());
    const qint64 sy = position[1].toInteger(std::numeric_limits<qint64>::min());
    const qint64 sw = size[0].toInteger(-1), sh = size[1].toInteger(-1);
    if (sx < -131072 || sx > 131072 || sy < -131072 || sy > 131072 || sw <= 0 || sh <= 0
        || sw > 32768 || sh > 32768) return unavailable();
    const Rect sourceRect{int(sx), int(sy), int(sw), int(sh)};
    LogicalOutput *matched = nullptr;
    for (LogicalOutput *output : workspace()->outputs()) {
        if (output && output->geometry() == sourceRect) {
            if (matched) return unavailable();
            matched = output;
        }
    }
    if (!matched || waylandServer()->isScreenLocked()
        || waylandServer()->isKeyboardShortcutsInhibited() || input()->isSelectingWindow()
        || (effects && effects->activeFullScreenEffect())) return unavailable();

    Window *application = workspace()->activeWindow();
    if (!eligibleWindow(application) || !application->isActive()
        || application->hasPopupGrab() || !unconstrained(application->surface())) return unavailable();
    SurfaceInterface *surface = rootSurface(waylandServer()->seat()->focusedKeyboardSurface());
    Window *focus = surface ? waylandServer()->findWindow(surface) : nullptr;
    if (!eligibleWindow(focus)) return unavailable();
    ClientConnection *client = application->surface()->client();
    if (!client || client->tearingDown() || client->processId() <= 1 || client->userId() != geteuid()
        || client == waylandServer()->screenLockerClientConnection()
        || client == waylandServer()->inputMethodConnection() || application->pid() != client->processId()
        || !popupBelongsTo(focus, application, client)) return unavailable();
    const QString title = application->caption(), windowClass = application->resourceClass();
    if (!boundedText(title) || !boundedText(windowClass)) return unavailable();

    const RectF content = focus->clientGeometry();
    const int x = int(std::ceil(std::max(content.x(), double(sourceRect.x()))));
    const int y = int(std::ceil(std::max(content.y(), double(sourceRect.y()))));
    const int right = int(std::floor(std::min(content.x() + content.width(), double(sourceRect.right()))));
    const int bottom = int(std::floor(std::min(content.y() + content.height(), double(sourceRect.bottom()))));
    if (right <= x || bottom <= y) return unavailable();
    const RectF clipped(double(x), double(y), double(right - x), double(bottom - y));
    const QList<Window *> order = workspace()->stackingOrder();
    const qsizetype index = order.indexOf(focus);
    if (index < 0) return unavailable();
    for (qsizetype i = index + 1; i < order.size(); ++i) {
        Window *other = order[i];
        if (other && other != focus && other->isShown() && !other->isMinimized() && !other->isDeleted()
            && other->isOnCurrentDesktop() && other->isOnCurrentActivity()
            && intersects(clipped, other->frameGeometry())) return unavailable();
    }
    if (workspace()->activeWindow() != application
        || rootSurface(waylandServer()->seat()->focusedKeyboardSurface()) != surface) return unavailable();
    const QJsonObject bounds{{"x", x - sourceRect.x()}, {"y", y - sourceRect.y()},
                             {"width", right - x}, {"height", bottom - y}};
    const QJsonObject result{{"protocol", 1}, {"challenge", challenge}, {"source_digest", digest},
        {"native_wayland", true}, {"safe_focus", true}, {"authoritative", "wl_client credentials"},
        {"pid", int(client->processId())}, {"focus_serial", qint64(m_focusSerial)},
        {"focus_token", QString::number(m_focusToken)}, {"title", title},
        {"wm_class", windowClass}, {"modal", focus->isModal()}, {"bounds", bounds}};
    return QString::fromUtf8(QJsonDocument(result).toJson(QJsonDocument::Compact));
}

class KWIN_EXPORT OdinScopeFactory final : public PluginFactory
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID PluginFactory_iid FILE "metadata.json")
    Q_INTERFACES(KWin::PluginFactory)
public:
    std::unique_ptr<Plugin> create() const override { return std::make_unique<OdinScope>(); }
};
}
#include "odinscope.moc"

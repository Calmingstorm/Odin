/* SPDX-License-Identifier: GPL-2.0-or-later */
#pragma once
#include <QDBusContext>
#include <QObject>
#include <QString>
#include "plugin.h"

namespace KWin
{
class OdinScope final : public Plugin, protected QDBusContext
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.KWin.OdinScope")
public:
    OdinScope();
    ~OdinScope() override;
public Q_SLOTS:
    Q_SCRIPTABLE QString Identity(const QString &challenge);
    Q_SCRIPTABLE QString Snapshot(const QString &request);
private:
    QString unavailable();
    quint64 m_focusSerial = 1;
    quint64 m_focusToken = 1;
    bool m_registeredObject = false;
    bool m_registeredService = false;
};
}

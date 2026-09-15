// Protocol-object and signal doubles only. State methods are extracted verbatim
// from scope-plugin.cpp by the Python test, not reimplemented here.
#include "scope-provenance.hpp"
#include <algorithm>
#include <cassert>
#include <functional>
#include <memory>
#include <set>
#include <string>
#include <utility>
template<class T> using SP = std::shared_ptr<T>;
template<class T> struct WP {
    std::weak_ptr<T> value;
    WP() = default;
    WP(SP<T> p): value(p) {}
    WP& operator=(SP<T> p) { value=p; return *this; }
    bool expired() const { return value.expired(); }
    SP<T> lock() const { return value.lock(); }
    T* operator->() const { return lock().get(); }
    bool operator==(const WP& other) const { return lock()==other.lock(); }
};
using CHyprSignalListener = std::shared_ptr<int>;
template<class... Args> struct Signal {
    struct Entry { std::weak_ptr<int> life; std::function<void(Args...)> fn; };
    std::vector<Entry> entries;
    template<class F> CHyprSignalListener listen(F fn) {
        auto life=std::make_shared<int>(0); entries.push_back({life,fn}); return life;
    }
    void emit(Args... args) { for (auto& e:entries) if (!e.life.expired()) e.fn(args...); }
};
struct CXDGSurfaceResource;
struct CXDGPopupResource;
struct CWLSubsurfaceResource;
struct Window;
struct Vector2D { double x=0,y=0; bool operator==(const Vector2D&) const = default; };
struct Box { double x=0,y=0,w=80,h=60; bool operator==(const Box&) const = default; };
constexpr int SURFACE_ROLE_XDG_SHELL=1;
constexpr int SURFACE_ROLE_SUBSURFACE=2;
struct Role { virtual ~Role()=default; virtual int role() const { return SURFACE_ROLE_XDG_SHELL; } };
struct CXDGSurfaceRole: Role { WP<CXDGSurfaceResource> m_xdgSurface; };
struct CSubsurfaceRole: Role {
    WP<CWLSubsurfaceResource> m_subsurface;
    int role() const override { return SURFACE_ROLE_SUBSURFACE; }
};
struct CWLSurfaceResource {
    bool alive=true,m_mapped=true; void* owner=reinterpret_cast<void*>(99);
    SP<Role> m_role; bool good() const {return alive;} void* client() const {return owner;}
    std::vector<WP<CWLSubsurfaceResource>> m_subsurfaces;
    struct { Vector2D size{80,60}, offset; int scale=1,transform=0; } m_current;
    struct { Signal<> map,unmap,destroy,commit; Signal<SP<CWLSubsurfaceResource>> newSubsurface; } m_events;
};
struct CWLSubsurfaceResource {
    bool alive=true; WP<CWLSurfaceResource> m_surface,m_parent;
    Vector2D m_position; int m_zIndex=0;
    struct { Signal<> destroy; } m_events;
    bool good() const { return alive; }
};
// Use the production value type as well as the production State methods.
#include "native_popup_subsurface_node.hpp"
struct Owner { bool alive=true; void* owner=reinterpret_cast<void*>(99);
    std::vector<WP<CXDGSurfaceResource>> m_surfaces;
    bool good() const{return alive;} void* client() const{return owner;}
};
struct Top { bool alive=true; WP<CXDGSurfaceResource> m_owner; WP<Window> m_window;
    bool good() const{return alive;}
};
struct CXDGPopupResource { bool alive=true; WP<CXDGSurfaceResource> m_surface,m_parent; Box m_geometry;
    struct {Signal<> reposition,dismissed,destroy;} m_events;
    bool good() const{return alive;}
};
struct CXDGSurfaceResource { bool alive=true,m_mapped=true;
    WP<CWLSurfaceResource> m_surface; WP<Owner> m_owner;
    WP<CXDGPopupResource> m_popup; WP<Top> m_toplevel;
    struct { Box geometry; } m_current;
    struct { Signal<> map,unmap,destroy,commit; Signal<SP<CXDGPopupResource>> newPopup; } m_events;
    bool good() const{return alive;}
};
struct Window { WP<CXDGSurfaceResource> m_xdgSurface; };
struct PopupWatch {bool valid=true, action=false; std::set<uintptr_t> withdrawn;
    std::vector<WP<CWLSurfaceResource>> captured; std::vector<CHyprSignalListener> listeners;};
struct Snapshot {WP<CWLSurfaceResource> surface, pointerSurface; WP<Window> window;
    std::vector<SubsurfaceNode> subsurfaces;
    std::vector<std::vector<odin_scope::PopupAncestor>> popups; SP<PopupWatch> popupWatch;
};
struct Node {
    SP<CWLSurfaceResource> surface=std::make_shared<CWLSurfaceResource>();
    SP<CXDGSurfaceResource> xdg=std::make_shared<CXDGSurfaceResource>();
    SP<CXDGSurfaceRole> role=std::make_shared<CXDGSurfaceRole>();
    SP<CXDGPopupResource> popup;
    Node(SP<Owner> owner) { surface->m_role=role; role->m_xdgSurface=xdg;
        xdg->m_surface=surface; xdg->m_owner=owner; owner->m_surfaces.push_back(xdg); }
    void childOf(Node& parent) { popup=std::make_shared<CXDGPopupResource>();
        popup->m_surface=xdg; popup->m_parent=parent.xdg; xdg->m_popup=popup; }
};
struct Fixture {
    SP<Owner> owner=std::make_shared<Owner>();
    Node root{owner}, child{owner}, nested{owner};
    SP<Window> window=std::make_shared<Window>(); SP<Top> top=std::make_shared<Top>();
    Snapshot snapshot;
    Fixture() { root.xdg->m_toplevel=top; top->m_owner=root.xdg; top->m_window=window;
        window->m_xdgSurface=root.xdg; snapshot.surface=root.surface; snapshot.window=window;
        child.childOf(root); nested.childOf(child); }
};

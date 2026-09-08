int main(int argc, char** argv) {
    assert(argc==2); std::string scenario=argv[1];
    Fixture f; State state; auto& b=f.snapshot;
    std::vector<odin_scope::PopupAncestor> chain;
    assert(state.popupChain(b,f.root.surface,chain) && chain.size()==1);
    assert(state.popupChain(b,f.nested.surface,chain) && chain.size()==3);
    b.popups=state.popupInventory(b); assert(b.popups.size()==2);
    assert(state.destination(b,f.nested.surface));
    if (scenario=="ancestry") {
        auto refuses=[&]{ assert(!state.popupChain(b,f.nested.surface,chain)); };
        f.nested.surface->owner=reinterpret_cast<void*>(100); refuses(); f.nested.surface->owner=f.owner->owner;
        f.nested.surface->m_mapped=false; refuses(); f.nested.surface->m_mapped=true;
        f.nested.xdg->m_mapped=false; refuses(); f.nested.xdg->m_mapped=true;
        f.nested.xdg->m_surface=f.child.surface; refuses(); f.nested.xdg->m_surface=f.nested.surface;
        f.nested.popup->m_surface=f.child.xdg; refuses(); f.nested.popup->m_surface=f.nested.xdg;
        f.nested.popup->m_parent=f.nested.xdg; refuses(); f.nested.popup->m_parent=f.child.xdg;
        f.root.xdg->m_toplevel=SP<Top>{}; refuses(); f.root.xdg->m_toplevel=f.top;
        f.top->m_owner=f.child.xdg; refuses(); f.top->m_owner=f.root.xdg;
        f.window->m_xdgSurface=f.child.xdg; refuses(); f.window->m_xdgSurface=f.root.xdg;
        f.nested.xdg->m_toplevel=f.top; refuses(); f.nested.xdg->m_toplevel=SP<Top>{};
        f.owner->alive=false; refuses(); f.owner->alive=true;
        assert(state.popupChain(b,f.nested.surface,chain));
        Node unobserved{f.owner}; unobserved.childOf(f.root);
        assert(!state.destination(b,unobserved.surface));
        f.nested.popup->m_geometry.x++;
        assert(!state.destination(b,f.nested.surface));
        assert(state.popupInventory(b)!=b.popups);
        return 0;
    }
    if (scenario=="bounds") {
        std::vector<std::unique_ptr<Node>> deep;
        Node* parent=&f.nested;
        for (int i=0;i<30;++i) {
            deep.push_back(std::make_unique<Node>(f.owner));
            deep.back()->childOf(*parent); parent=deep.back().get();
        }
        assert(state.popupChain(b,parent->surface,chain) && chain.size()==33);
        Node tooDeep{f.owner}; tooDeep.childOf(*parent);
        assert(!state.popupChain(b,tooDeep.surface,chain));
        f.owner->m_surfaces.resize(256);
        state.watchPopups(b); assert(b.popupWatch->valid);
        f.owner->m_surfaces.resize(257);
        assert(state.popupInventory(b)==std::vector<std::vector<odin_scope::PopupAncestor>>{{{}}});
        state.watchPopups(b); assert(!b.popupWatch->valid); return 0;
    }
    // Watch an existing unmapped popup. map/unmap returns the inventory to its
    // original value, but must not resurrect the captured scope's validity.
    if (scenario=="unrelated") {
        Node unrelated{f.owner}; unrelated.childOf(f.root);
        unrelated.popup->m_parent=unrelated.xdg; // inadmissible cyclic ancestry
        b.popups=state.popupInventory(b); state.watchPopups(b);
        unrelated.xdg->m_events.map.emit();
        assert(state.popupInventory(b)==b.popups);
    } else if (scenario=="map-unmap") {
        f.nested.surface->m_mapped=false; f.nested.xdg->m_mapped=false;
        b.popups=state.popupInventory(b); state.watchPopups(b);
        f.nested.surface->m_mapped=true; f.nested.xdg->m_mapped=true; f.nested.xdg->m_events.map.emit();
        f.nested.surface->m_mapped=false; f.nested.xdg->m_mapped=false; f.nested.xdg->m_events.unmap.emit();
        assert(state.popupInventory(b)==b.popups);
    } else {
        state.watchPopups(b); assert(b.popupWatch->valid);
        f.nested.xdg->m_events.commit.emit(); assert(b.popupWatch->valid && state.revision==0);
        if (scenario=="geometry") {f.nested.xdg->m_current.geometry.x++; f.nested.xdg->m_events.commit.emit(); f.nested.xdg->m_current.geometry.x--;}
        else if (scenario=="placement") {f.nested.popup->m_geometry.y++; f.nested.xdg->m_events.commit.emit(); f.nested.popup->m_geometry.y--;}
        else if (scenario=="reposition") f.nested.popup->m_events.reposition.emit();
        else if (scenario=="dismissed") f.nested.popup->m_events.dismissed.emit();
        else if (scenario=="popup-destroy") f.nested.popup->m_events.destroy.emit();
        else if (scenario=="surface-destroy") f.nested.xdg->m_events.destroy.emit();
        else if (scenario=="unmap") f.nested.xdg->m_events.unmap.emit();
        else if (scenario=="root-new") f.root.xdg->m_events.newPopup.emit(f.nested.popup);
        else if (scenario=="nested-new") f.child.xdg->m_events.newPopup.emit(f.nested.popup);
        else if (scenario=="expired-popup") {f.nested.popup.reset(); f.nested.xdg->m_events.commit.emit();}
        else if (scenario=="retired-watch") {
            b.popupWatch.reset(); f.nested.xdg->m_events.map.emit(); assert(state.revision==0); return 0;
        } else assert(false);
    }
    assert(!b.popupWatch->valid && state.revision==1);
    f.nested.xdg->m_events.commit.emit(); f.root.xdg->m_events.newPopup.emit(f.child.popup);
    assert(!b.popupWatch->valid && state.revision==1);
}

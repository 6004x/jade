// Copyright (C) 2011-2014 Massachusetts Institute of Technology
// Chris Terman

// JADE: JAvascript Design Envrionment

// Model:
//  libraries: object with Library attributes
//  Library: object with Module attributes
//  Module: [ object with Aspect attributes, object with Propery attributes ]
//  Property: object with the following attributes: type, label, value, edit, choices
//  Aspect: list of Components, support for ConnectionPoints, undo/reo
//  Component: list of [type coords { property: value... }]
//  coords: list of position/dimension params (x, y, rotation)...

// View/Controller:
//  Editor -- library management toolbar, tabbed display of aspect editors, status
//  Aspect editors (Schematic, Icon, ...) -- toolbar, diagram, parts bin if appropriate
//  Toolbar -- object with Tool attributes, support for adding, enabling, disabling tools
//  Diagram -- view for editing a given Aspect, support for editing gestures, pop-up windows
//  PartsBin -- view for selecting library/module to include as instance

// make jslint happy
//var JSON,$;

$(document).ready(function() {
    // look for nodes of class "jade" and give them an editor
    $('.jade').each(function(index, node) {
        if (node.jade === undefined) new jade.Jade(node);
    });
});

var jade = (function() {
    //////////////////////////////////////////////////////////////////////
    //
    // Libraries
    //
    //////////////////////////////////////////////////////////////////////

    var libraries = {}; // attributes are Library objects

    function Library(name, json) {
        this.name = name;
        this.modules = {}; // attributes are Module objects
        this.modified = false;

        libraries[name] = this;

        if (json) this.load(json);
    }

    // initialize library from JSON object
    Library.prototype.load = function(json) {
        // note that modules may have already been created because they've
        // been referenced as a component is some other library.
        for (var m in json) {
            this.module(m).load(json[m]);
        }
        this.set_modified(false); // newly loaded libraries are unmodified
    };

    // return specified Module, newly created if necessary
    Library.prototype.module = function(name) {
        var module = this.modules[name];
        if (module === undefined) {
            module = new Module(name, this);
            this.modules[name] = module;
            this.set_modified(true);
        }
        return module;
    };

    // produce JSON representation of a library
    Library.prototype.json = function() {
        // weed out empty modules
        var json = {};
        for (var m in this.modules) {
            var module = this.modules[m].json();
            if (module) json[m] = module;
        }
        return json;
    };

    Library.prototype.set_modified = function(which) {
        if (which != this.modified) {
            this.modified = which;
            if (which) $('body').attr('data-dirty','yes');
            else {
                // if all libraries are now unmodified, clear data-dirty attr
                var dirty = false;
                $.each(libraries,function (lname,lib) { if (lib.modified) dirty = true; });
                if (!dirty) $('body').removeAttr('data-dirty');
            }
        }
    };

    // If all modules are clean, library is too
    Library.prototype.check_modified = function() {
        var dirty = false;
        $.each(this.modules,function (mname,module) { if (module.modified) dirty = true; });
        if (!dirty) this.set_modified(false);
    };

    // if necessary save library to server
    Library.prototype.save = function() {
        if (this.modified) {
            var lib = this; // for closure
            var args = {
                url: 'server.cgi',
                type: 'POST',
                data: {
                    file: this.name,
                    json: JSON.stringify(this.json())
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    alert(errorThrown);
                },
                success: function() {
                    // clear modified status for library and its modules
                    for (var m in this.modules) {
                        this.modules[m].set_modified(false);
                    }
                    lib.set_modified(false);
                }
            };
            $.ajax(args);
        }
    };

    // update server with any changes to loaded libraries
    function save_libraries() {
        for (var l in libraries) {
            libraries[l].save();
        }
    }

    function load_library(lname) {
        //var base_url = document.getElementById('jade-script').src;
        //base_url = base_url.substr(0,base_url.length - 7);  // strip off 'jade.js'
        // get contents from the server
        var args = {
            async: false, // hang until load completes
            url: 'server.cgi',
            type: 'POST',
            data: { file: lname },
            dataType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                alert('Error while loading library '+lname+': '+errorThrown);
            },
            success: function(json) {
                // allocate new library, add to list so we know we're loading it
                var lib = new Library(lname);
                lib.load(json);
            }
        };
        $.ajax(args);
    }

    // return specified Module, newly created if necessary. Module names have
    // the form library:module.  This function will contact server to load needed
    // library.
    function find_module(name) {
        var parse = name.split(':');
        var lname, mname;
        if (parse.length == 1) {
            lname = 'user';
            mname = parse[0];
        }
        else if (parse.length == 2) {
            lname = parse[0];
            mname = parse[1];
        }
        else return undefined;

        if (!(lname in libraries)) load_library(lname);

        return libraries[lname].module(mname);
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Modules
    //
    //////////////////////////////////////////////////////////////////////

    function Module(name, lib, json) {
        this.library = lib;
        this.name = name;
        this.aspects = {};
        this.properties = {};
        this.modified = false;

        // list of callbacks when load is complete
        this.loaded = false;
        this.listeners = [];

        if (json) this.load(json);
    }

    Module.prototype.get_name = function() {
        return this.library.name + ':' + this.name;
    };

    Module.prototype.add_listener = function(callback) {
        // if we're already loaded, do callback now
        if (this.loaded) callback('load');
        else this.listeners.push(callback);
    };

    Module.prototype.set_modified = function(which) {
        if (this.modified != which) {
            this.modifed = which;
            if (which) this.library.set_modified(true);
            else library.check_modified();
        }
    };

    // if all aspects are clean, module is too
    Module.prototype.check_modified = function() {
        var dirty = false;
        $.each(this.aspects,function (aname,aspect) { if (aspect.modified) dirty = true; });
        if (!dirty) this.set_modified(false);
    };

    Module.prototype.set_property = function(prop, v) {
        this.properties[prop] = v;
        this.set_modified(true);
    };

    Module.prototype.remove_property = function(prop) {
        if (prop in this.properties) {
            delete this.properties[prop];
            this.set_modified(true);
        }
    };

    // initialize module from JSON object
    Module.prototype.load = function(json) {
        // load aspects
        for (var a in json[0]) {
            this.aspects[a] = new Aspect(a, this, json[0][a]);
        }

        // load properties
        this.properties = json[1];

        // a newly loaded module starts as unmodified
        this.set_modified(false);

        this.loaded = true;
        for (var i = this.listeners.length - 1; i >= 0; i -= 1) {
            this.listeners[i]('load');
        }
    };

    Module.prototype.has_aspect = function(name) {
        if (name in this.aspects) return !this.aspects[name].empty();
        return false;
    };

    // return specified aspect, newly created if necessary
    Module.prototype.aspect = function(name) {
        var aspect = this.aspects[name];
        if (aspect === undefined) {
            aspect = new Aspect(name, this);
            this.aspects[name] = aspect;
        }
        return aspect;
    };

    // produce JSON representation of a module, undefined if module is empty
    Module.prototype.json = function() {
        // weed out empty aspects
        var aspects;
        for (var a in this.aspects) {
            var json = this.aspects[a].json();
            if (json.length > 0) {
                if (aspects === undefined) aspects = {};
                aspects[a] = json;
            }
        }

        // if module is empty, returned undefined
        if (aspects === undefined && Object.keys(this.properties).length === 0) return undefined;

        return [aspects || {}, this.properties];
    };

    //////////////////////////////////////////////////////////////////////
    //
    // Aspects
    //
    //////////////////////////////////////////////////////////////////////

    function Aspect(name, module, json) {
        this.module = module;
        this.name = name;
        this.components = [];
        this.modified = false;

        this.connection_points = {}; // location string => list of cp's

        // for undo/redo keep a list of actions and the changes that resulted.
        // Each element of the list is a list of changes that happened concurrently,
        // they will all be undone or redone together.  Each change is a list:
        // [component, 'action', params...]
        this.actions = [];
        this.current_action = -1; // index of current list of changes
        this.change_list = undefined;

        if (json) this.load(json);
    }

    // initialize aspect from JSON object
    Aspect.prototype.load = function(json) {
        for (var i = 0; i < json.length; i += 1) {
            var c = make_component(json[i]);
            c.add(this);
        }
        this.set_modified(false);
    };

    Aspect.prototype.set_modified = function(which) {
        if (which != this.modified) {
            this.modified = which;
            if (this.module) {
                if (which) this.module.set_modified(which);
                else this.module.check_modified();
            }
        }
    };

    Aspect.prototype.json = function() {
        var json = [];
        for (var i = 0; i < this.components.length; i += 1) {
            json.push(this.components[i].json());
        }
        return json;
    };

    Aspect.prototype.empty = function() {
        return this.components.length === 0;
    };

    Aspect.prototype.start_action = function() {
        this.change_list = []; // start recording changes
    };

    Aspect.prototype.end_action = function() {
        if (this.change_list !== undefined && this.change_list.length > 0) {
            this.clean_up_wires(true); // canonicalize diagram's wires
            this.set_modified(true);
            this.current_action += 1;

            // truncate action list at current entry
            if (this.actions.length > this.current_action) this.actions = this.actions.slice(0, this.current_action);

            this.actions.push(this.change_list);
        }
        this.change_list = undefined; // stop recording changes
    };

    Aspect.prototype.add_change = function(change) {
        if (this.change_list !== undefined) this.change_list.push(change);
    };

    Aspect.prototype.can_undo = function() {
        return this.current_action >= 0;
    };

    Aspect.prototype.undo = function() {
        if (this.current_action >= 0) {
            var changes = this.actions[this.current_action];
            this.current_action -= 1;
            // undo changes in reverse order
            for (var i = changes.length - 1; i >= 0; i -= 1) {
                changes[i](this, 'undo');
            }
            this.clean_up_wires(false); // canonicalize diagram's wires
        }

        this.set_modified(this.current_action == -1);
    };

    Aspect.prototype.can_redo = function() {
        return this.current_action + 1 < this.actions.length;
    };

    Aspect.prototype.redo = function() {
        if (this.current_action + 1 < this.actions.length) {
            this.current_action += 1;
            var changes = this.actions[this.current_action];
            // redo changes in original order
            for (var i = 0; i < changes.length; i += 1) {
                changes[i](this, 'redo');
            }
            this.clean_up_wires(false); // canonicalize diagram's wires
            this.changed = true;
        }
    };

    Aspect.prototype.add_component = function(new_c) {
        this.components.push(new_c);
    };

    Aspect.prototype.remove_component = function(c) {
        var index = this.components.indexOf(c);
        if (index != -1) {
            this.components.splice(index, 1);
        }
    };

    Aspect.prototype.map_over_components = function(f) {
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            if (f(this.components[i], i)) return;
        }
    };

    Aspect.prototype.selections = function() {
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            if (this.components[i].selected) return true;
        }
        return false;
    };

    // returns component if there's exactly one selected, else undefined
    Aspect.prototype.selected_component = function() {
        var selected;
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            if (this.components[i].selected) {
                if (selected === undefined) selected = this.components[i];
                else return undefined;
            }
        }
        return selected;
    };

    Aspect.prototype.find_connections = function(cp) {
        return this.connection_points[cp.location];
    };

    // add connection point to list of connection points at that location
    Aspect.prototype.add_connection_point = function(cp) {
        var cplist = this.connection_points[cp.location];
        if (cplist) cplist.push(cp);
        else {
            cplist = [cp];
            this.connection_points[cp.location] = cplist;
        }

        // return list of conincident connection points
        return cplist;
    };

    // remove connection point from the list points at the old location
    Aspect.prototype.remove_connection_point = function(cp, old_location) {
        // remove cp from list at old location
        var cplist = this.connection_points[old_location];
        if (cplist) {
            var index = cplist.indexOf(cp);
            if (index != -1) {
                cplist.splice(index, 1);
                // if no more connections at this location, remove
                // entry from array to keep our search time short
                if (cplist.length === 0) delete this.connection_points[old_location];
            }
        }
    };

    // connection point has changed location: remove, then add
    Aspect.prototype.update_connection_point = function(cp, old_location) {
        this.remove_connection_point(cp, old_location);
        return this.add_connection_point(cp);
    };

    // add a wire to the diagram
    Aspect.prototype.add_wire = function(x1, y1, x2, y2, rot) {
        var new_wire = make_component(['wire', [x1, y1, rot, x2 - x1, y2 - y1]]);
        new_wire.add(this);
        return new_wire;
    };

    Aspect.prototype.split_wire = function(w, cp) {
        // remove bisected wire
        w.remove();

        // add two new wires with connection point cp in the middle
        this.add_wire(w.coords[0], w.coords[1], cp.x, cp.y, 0);
        var far_end = w.far_end();
        this.add_wire(far_end[0], far_end[1], cp.x, cp.y, 0);
    };

    // see if connection points of component c split any wires
    Aspect.prototype.check_wires = function(c) {
        for (var i = 0; i < this.components.length; i += 1) {
            var cc = this.components[i];
            if (cc != c) { // don't check a component against itself
                // only wires will return non-null from a bisect call
                var cp = cc.bisect(c);
                if (cp) {
                    // cc is a wire bisected by connection point cp
                    this.split_wire(cc, cp);
                }
            }
        }
    };

    // see if there are any existing connection points that bisect wire w
    Aspect.prototype.check_connection_points = function(w) {
        for (var locn in this.connection_points) {
            var cplist = this.connection_points[locn];
            if (cplist && w.bisect_cp(cplist[0])) {
                this.split_wire(w, cplist[0]);
                // stop here, new wires introduced by split will do their own checks
                return;
            }
        }
    };

    // merge collinear wires sharing an end point.
    Aspect.prototype.clean_up_wires = function() {
        // merge colinear wires
        for (var locn in this.connection_points) {
            var cplist = this.connection_points[locn];
            if (cplist && cplist.length == 2) {
                // found a connection with just two connections, see if they're wires
                var c1 = cplist[0].parent;
                var c2 = cplist[1].parent;
                if (c1.type == 'wire' && c2.type == 'wire') {
                    var e1 = c1.other_end(cplist[0]);
                    var e2 = c2.other_end(cplist[1]);
                    var e3 = cplist[0]; // point shared by the two wires
                    if (collinear(e1, e2, e3)) {
                        c1.remove();
                        c2.remove();
                        this.add_wire(e1.x, e1.y, e2.x, e2.y, 0);
                    }
                }
            }
        }

        // remove redundant wires
        while (this.remove_redundant_wires());
    };

    // elminate wires between the same end points.  Keep calling until it returns false.
    Aspect.prototype.remove_redundant_wires = function() {
        for (var locn in this.connection_points) {
            var cplist = this.connection_points[locn];
            for (var i = 0; i < cplist.length; i += 1) {
                var cp1 = cplist[i];
                var w1 = cp1.parent;
                if (w1.type == 'wire') {
                    var cp2 = w1.other_end(cp1);
                    for (var j = i + 1; j < cplist.length; j += 1) {
                        var w2 = cplist[j].parent;
                        if (w2.type == 'wire' && w2.other_end(cp1).coincident(cp2.x, cp2.y)) {
                            // circumvent unnecessary wire removal search
                            Component.prototype.remove.call(w2);
                            // we've modified lists we're iterating over, so to avoid
                            // confusion, start over
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };

    Aspect.prototype.selections = function() {
        var selections = false;
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            if (this.components[i].selected) selections = true;
        }
        return selections;
    };

    Aspect.prototype.compute_bbox = function(initial_bbox, selected, unselected) {
        // compute bounding box for selection
        var min_x = (initial_bbox === undefined) ? Infinity : initial_bbox[0];
        var max_x = (initial_bbox === undefined) ? -Infinity : initial_bbox[2];
        var min_y = (initial_bbox === undefined) ? Infinity : initial_bbox[1];
        var max_y = (initial_bbox === undefined) ? -Infinity : initial_bbox[3];
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            var component = this.components[i];
            if (selected && !component.selected) continue;
            if (unselected && component.selected) continue;
            if (component.type == 'property') continue;

            min_x = Math.min(component.bbox[0], min_x);
            max_x = Math.max(component.bbox[2], max_x);
            min_y = Math.min(component.bbox[1], min_y);
            max_y = Math.max(component.bbox[3], max_y);
        }
        return [min_x, min_y, max_x, max_y];
    };

    Aspect.prototype.unselected_bbox = function(initial_bbox) {
        return this.compute_bbox(initial_bbox, false, true);
    };

    Aspect.prototype.selected_bbox = function(initial_bbox) {
        return this.compute_bbox(initial_bbox, true, false);
    };

    Aspect.prototype.selected_grid = function() {
        var grid = 1;
        for (var i = this.components.length - 1; i >= 0; i -= 1) {
            var c = this.components[i];
            if (c.selected) grid = Math.max(grid, c.required_grid);
        }
        return grid;
    };

    // label all the nodes in the circuit
    Aspect.prototype.label_connection_points = function(prefix, port_map) {
        var i;
        
        // start by clearing all the connection point labels
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].clear_labels();
        }

        // components are in charge of labeling their unlabeled connections.
        // labels given to connection points will propagate to coincident connection
        // points and across Wires.

        // let special components like GND or named wires label their connection(s)
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].add_default_labels(prefix, port_map);
        }

        // now have components generate labels for unlabeled connections
        this.next_label = 0;
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].label_connections(prefix);
        }
    };

    // generate a new label
    Aspect.prototype.get_next_label = function(prefix) {
        // generate next label in sequence
        this.next_label += 1;
        return prefix + this.next_label.toString();
    };

    // propagate label to coincident connection points
    Aspect.prototype.propagate_label = function(label, location) {
        var cplist = this.connection_points[location];
        for (var i = cplist.length - 1; i >= 0; i -= 1) {
            cplist[i].propagate_label(label);
        }
    };

    Aspect.prototype.ensure_component_names = function(prefix) {
        var i, c, name;

        // first find out what names have been assigned
        var cnames = {}; // keep track of names at this level
        for (i = 0; i < this.components.length; i += 1) {
            c = this.components[i];
            name = c.name;
            if (name) {
                if (name in cnames) throw "Duplicate component name: " + prefix + name;
                cnames[name] = c; // add to our list
            }
        }

        // now create reasonable unique name for unnamed components that have name property
        for (i = 0; i < this.components.length; i += 1) {
            c = this.components[i];
            if (c.module.name === undefined) continue; // filter out built-in components
            name = c.name;
            if (name === '' || name === undefined) {
                var counter = 1;
                while (true) {
                    name = c.module.name.toUpperCase() + '_' + counter.toString();
                    if (!(name in cnames)) break;
                    counter += 1;
                }
                c.name = name; // remember name assignment for next time
                cnames[name] = c; // add to our list
            }
        }
    };

    // mlist is a list of module names "lib:module" that are the leaves
    // of the extraction tree.
    // port_map is an associative array: local_sig => external_sig
    Aspect.prototype.netlist = function(mlist, prefix, port_map) {
        // figure out signal names for all connections
        this.label_connection_points(prefix, port_map);

        // ensure unique names for each component
        this.ensure_component_names(prefix);

        // extract netlist from each component
        var netlist = [];
        for (var i = 0; i < this.components.length; i += 1) {
            var n = this.components[i].netlist(mlist, prefix);
            if (n !== undefined) netlist.push.apply(netlist, n);
        }
        return netlist;
    };

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Rectangle helper functions
    //
    ////////////////////////////////////////////////////////////////////////////////

    // rect is an array of the form [left,top,right,bottom]

    // ensure left < right, top < bottom
    function canonicalize(r) {
        var temp;

        // canonicalize bounding box
        if (r[0] > r[2]) {
            temp = r[0];
            r[0] = r[2];
            r[2] = temp;
        }
        if (r[1] > r[3]) {
            temp = r[1];
            r[1] = r[3];
            r[3] = temp;
        }
    }

    function between(x, x1, x2) {
        return x1 <= x && x <= x2;
    }

    // only works for manhattan rectangles
    function intersect(r1, r2) {
        // look for non-intersection, negate result
        var result = !(r2[0] > r1[2] || r2[2] < r1[0] || r2[1] > r1[3] || r2[3] < r1[1]);

        // if I try to return the above expression, javascript returns undefined!!!
        return result;
    }

    function transform_x(rot, x, y) {
        if (rot === 0 || rot == 6) return x;
        else if (rot == 1 || rot == 5) return -y;
        else if (rot == 2 || rot == 4) return -x;
        else return y;
    }

    function transform_y(rot, x, y) {
        if (rot == 1 || rot == 7) return x;
        else if (rot == 2 || rot == 6) return -y;
        else if (rot == 3 || rot == 5) return -x;
        else return y;
    }

    // result of composing two rotations: orient[old*8 + new]
    var rotate = [
        0, 1, 2, 3, 4, 5, 6, 7, // NORTH (identity)
        1, 2, 3, 0, 7, 4, 5, 6, // EAST (rot270) rotcw
        2, 3, 0, 1, 6, 7, 4, 5, // SOUTH (rot180)
        3, 0, 1, 2, 5, 6, 7, 4, // WEST (rot90) rotccw
        4, 5, 6, 7, 0, 1, 2, 3, // RNORTH (negx) fliph
        5, 6, 7, 4, 3, 0, 1, 2, // REAST (int-neg)
        6, 7, 4, 5, 2, 3, 0, 1, // RSOUTH (negy) flipy
        7, 4, 5, 6, 1, 2, 3, 0 // RWEST (int-pos)
    ];

    //////////////////////////////////////////////////////////////////////
    //
    // Components
    //
    //////////////////////////////////////////////////////////////////////

    var built_in_components = {};

    function make_component(json) {
        var c = built_in_components[json[0]];

        if (c) return new c(json);
        else return new Component(json);
    }

    // general-purpose component, drawn in a diagram using its icon
    function Component(json) {
        this.aspect = undefined;
        this.module = undefined;
        this.icon = undefined;

        this.type = undefined;
        this.coords = [0, 0, 0];
        this.properties = {};

        this.selected = false;
        this.bounding_box = [0, 0, 0, 0]; // in device coords [left,top,right,bottom]
        this.bbox = this.bounding_box; // in absolute coords
        this.connections = [];

        if (json) this.load(json);
    }
    Component.prototype.required_grid = 8;

    Component.prototype.clone_properties = function(remove_default_values) {
        // weed out empty properties or those that match default value
        var props = {};
        for (var p in this.properties) {
            var v = this.properties[p];
            if (v !== undefined && v !== '' && (!remove_default_values || v != this.module.properties[p].value)) props[p] = v;
        }
        return props;
    };

    Component.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        // track down icon and set up bounding box and connections
        var component = this; // for closure
        this.module = find_module(this.type);
        this.module.add_listener(function() {
            Component.prototype.compute_bbox.call(component);
        });
    };

    Component.prototype.default_properties = function() {
        // update properties from module's default values
        for (var p in this.module.properties) {
            if (!(p in this.properties)) this.properties[p] = this.module.properties[p].value || '';
        }
    };

    Component.prototype.compute_bbox = function() {
        // update properties from module's default values
        this.default_properties();
        this.name = this.properties.name; // used when extracting netlists

        this.icon = this.module.aspect('icon');
        if (this.icon === undefined) return;

        // look for terminals in the icon and add appropriate connection
        // points for this instance
        var component = this; // for closure
        this.icon.map_over_components(function(c) {
            var cp = c.terminal_coords();
            if (cp) component.add_connection(cp[0], cp[1], cp[2]);
        });

        this.bounding_box = this.icon.compute_bbox();
        this.update_coords();
    };

    // default: no terminal coords to provide!
    Component.prototype.terminal_coords = function() {
        return undefined;
    };

    Component.prototype.json = function() {
        var p = this.clone_properties(true);
        if (Object.keys(p).length > 0) return [this.type, this.coords.slice(0), p];
        else return [this.type, this.coords.slice(0)];
    };

    Component.prototype.clone = function(x, y) {
        var c = make_component(this.json());
        c.coords[0] = x; // override x and y
        c.coords[1] = y;
        return c;
    };

    Component.prototype.has_aspect = function(name) {
        if (this.module !== undefined) return this.module.has_aspect(name);
        else return false;
    };

    Component.prototype.set_select = function(which) {
        this.selected = which;
    };

    Component.prototype.add_connection = function(offset_x, offset_y, name) {
        this.connections.push(new ConnectionPoint(this, offset_x, offset_y, name));
    };

    Component.prototype.update_coords = function() {
        var x = this.coords[0];
        var y = this.coords[1];

        // update bbox
        var b = this.bounding_box;
        this.bbox[0] = this.transform_x(b[0], b[1]) + x;
        this.bbox[1] = this.transform_y(b[0], b[1]) + y;
        this.bbox[2] = this.transform_x(b[2], b[3]) + x;
        this.bbox[3] = this.transform_y(b[2], b[3]) + y;
        canonicalize(this.bbox);

        // update connections
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            this.connections[i].update_location();
        }
    };

    Component.prototype.inside = function(x, y, rect) {
        if (rect === undefined) rect = this.bbox;
        return between(x, rect[0], rect[2]) && between(y, rect[1], rect[3]);
    };

    // rotate component relative to specified center of rotation
    Component.prototype.rotate = function(rotation, cx, cy) {
        var old_x = this.coords[0];
        var old_y = this.coords[1];
        var old_rotation = this.coords[2];

        // compute relative coords
        var rx = old_x - cx;
        var ry = old_y - cy;

        // compute new position and rotation
        var new_x = transform_x(rotation, rx, ry) + cx;
        var new_y = transform_y(rotation, rx, ry) + cy;
        var new_rotation = rotate[old_rotation * 8 + rotation];

        this.coords[0] = new_x;
        this.coords[1] = new_y;
        this.coords[2] = new_rotation;
        this.update_coords();

        // create a record of the change
        var component = this; // for closure
        this.aspect.add_change(function(diagram, action) {
            if (action == 'undo') {
                component.coords[0] = old_x;
                component.coords[1] = old_y;
                component.coords[2] = old_rotation;
            }
            else {
                component.coords[0] = new_x;
                component.coords[1] = new_y;
                component.coords[2] = new_rotation;
            }
            component.update_coords();
        });
    };

    Component.prototype.move_begin = function() {
        // remember where we started this move
        this.move_x = this.coords[0];
        this.move_y = this.coords[1];
        this.move_rotation = this.coords[2];
    };

    Component.prototype.move = function(dx, dy) {
        // update coordinates
        this.coords[0] += dx;
        this.coords[1] += dy;
        this.update_coords();
    };

    Component.prototype.move_end = function() {
        var dx = this.coords[0] - this.move_x;
        var dy = this.coords[1] - this.move_y;

        if (dx !== 0 || dy !== 0 || this.coords[2] != this.move_rotation) {
            // create a record of the change
            var component = this; // for closure
            this.aspect.add_change(function(diagram, action) {
                if (action == 'undo') component.move(-dx, - dy);
                else component.move(dx, dy);
                component.aspect.check_wires(component);
            });
            this.aspect.check_wires(this);
        }
    };

    Component.prototype.add = function(aspect) {
        this.aspect = aspect; // we now belong to a diagram!
        aspect.add_component(this);
        this.update_coords();

        // create a record of the change
        var component = this; // for closure
        aspect.add_change(function(diagram, action) {
            if (action == 'undo') component.remove();
            else component.add(diagram);
        });
    };

    Component.prototype.remove = function() {
        // remove connection points from diagram
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            var cp = this.connections[i];
            this.aspect.remove_connection_point(cp, cp.location);
        }

        // remove component from diagram
        this.aspect.remove_component(this);

        // create a record of the change
        var component = this; // for closure
        this.aspect.add_change(function(diagram, action) {
            if (action == 'undo') component.add(diagram);
            else component.remove();
        });
    };

    Component.prototype.transform_x = function(x, y) {
        return transform_x(this.coords[2], x, y);
    };

    Component.prototype.transform_y = function(x, y) {
        return transform_y(this.coords[2], x, y);
    };

    Component.prototype.moveTo = function(diagram, x, y) {
        var nx = this.transform_x(x, y) + this.coords[0];
        var ny = this.transform_y(x, y) + this.coords[1];
        diagram.moveTo(nx, ny);
    };

    Component.prototype.lineTo = function(diagram, x, y) {
        var nx = this.transform_x(x, y) + this.coords[0];
        var ny = this.transform_y(x, y) + this.coords[1];
        diagram.lineTo(nx, ny);
    };

    var colors_rgb = {
        'red': 'rgb(255,64,64)',
        'green': 'rgb(64,255,64)',
        'blue': 'rgb(64,64,255)',
        'cyan': 'rgb(64,255,255)',
        'magenta': 'rgb(255,64,255)',
        'yellow': 'rgb(255,255,64)',
        'black': 'rgb(0,0,0)'
    };

    Component.prototype.draw_line = function(diagram, x1, y1, x2, y2, width) {
        diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] || diagram.component_style);
        var nx1 = this.transform_x(x1, y1) + this.coords[0];
        var ny1 = this.transform_y(x1, y1) + this.coords[1];
        var nx2 = this.transform_x(x2, y2) + this.coords[0];
        var ny2 = this.transform_y(x2, y2) + this.coords[1];
        diagram.draw_line(nx1, ny1, nx2, ny2, width || 1);
    };

    Component.prototype.draw_circle = function(diagram, x, y, radius, filled) {
        if (filled) diagram.c.fillStyle = this.selected ? diagram.selected_style : diagram.normal_style;
        else diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] || diagram.component_style);
        var nx = this.transform_x(x, y) + this.coords[0];
        var ny = this.transform_y(x, y) + this.coords[1];

        diagram.draw_arc(nx, ny, radius, 0, 2 * Math.PI, false, 1, filled);
    };

    // draw arc from [x1,y1] to [x2,y2] passing through [x3,y3]
    Component.prototype.draw_arc = function(diagram, x1, y1, x2, y2, x3, y3) {
        diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] || diagram.component_style);

        // transform coords, make second two points relative to x,y
        var x = this.transform_x(x1, y1) + this.coords[0];
        var y = this.transform_y(x1, y1) + this.coords[1];
        var dx = this.transform_x(x2, y2) + this.coords[0] - x;
        var dy = this.transform_y(x2, y2) + this.coords[1] - y;
        var ex = this.transform_x(x3, y3) + this.coords[0] - x;
        var ey = this.transform_y(x3, y3) + this.coords[1] - y;

        // compute center of circumscribed circle
        // http://en.wikipedia.org/wiki/Circumscribed_circle
        var D = 2 * (dx * ey - dy * ex);
        if (D === 0) { // oops, it's just a line
            diagram.draw_line(x, y, dx + x, dy + y, 1);
            return;
        }
        var dsquare = dx * dx + dy * dy;
        var esquare = ex * ex + ey * ey;
        var cx = (ey * dsquare - dy * esquare) / D;
        var cy = (dx * esquare - ex * dsquare) / D;
        var r = Math.sqrt((dx - cx) * (dx - cx) + (dy - cy) * (dy - cy)); // radius

        // compute start and end angles relative to circle's center.
        // remember that y axis is positive *down* the page;
        // canvas arc angle measurements: 0 = x-axis, then clockwise from there
        var start_angle = 2 * Math.PI - Math.atan2(-(0 - cy), 0 - cx);
        var end_angle = 2 * Math.PI - Math.atan2(-(dy - cy), dx - cx);

        // make sure arc passes through third point
        var middle_angle = 2 * Math.PI - Math.atan2(-(ey - cy), ex - cx);
        var angle1 = end_angle - start_angle;
        if (angle1 < 0) angle1 += 2 * Math.PI;
        var angle2 = middle_angle - start_angle;
        if (angle2 < 0) angle2 += 2 * Math.PI;
        var ccw = (angle2 > angle1);

        diagram.draw_arc(cx + x, cy + y, r, start_angle, end_angle, ccw, 1, false);
    };

    // result of rotating an alignment [rot*9 + align]
    var aOrient = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, // NORTH (identity)
        2, 5, 8, 1, 4, 7, 0, 3, 6, // EAST (rot270)
        8, 7, 6, 5, 4, 3, 2, 1, 0, // SOUTH (rot180)
        6, 3, 0, 7, 4, 1, 8, 5, 3, // WEST (rot90)
        2, 1, 0, 5, 4, 3, 8, 7, 6, // RNORTH (negy)
        8, 5, 2, 7, 4, 1, 6, 3, 0, // REAST (int-neg)
        6, 7, 8, 3, 4, 5, 0, 1, 2, // RSOUTH (negx)
        0, 3, 6, 1, 4, 7, 2, 5, 8 // RWEST (int-pos)
    ];

    var textAlign = ['left', 'center', 'right', 'left', 'center', 'right', 'left', 'center', 'right'];

    var textBaseline = ['top', 'top', 'top', 'middle', 'middle', 'middle', 'bottom', 'bottom', 'bottom'];

    Component.prototype.draw_text = function(diagram, text, x, y, alignment, font, fill) {
        var a = aOrient[this.coords[2] * 9 + alignment];
        diagram.c.textAlign = textAlign[a];
        diagram.c.textBaseline = textBaseline[a];
        if (fill === undefined) diagram.c.fillStyle = this.selected ? diagram.selected_style : (colors_rgb[this.properties.color] || diagram.component_style);
        else diagram.c.fillStyle = fill;
        diagram.draw_text(text,
                          this.transform_x(x, y) + this.coords[0],
                          this.transform_y(x, y) + this.coords[1],
                          font);
    };

    Component.prototype.draw_text_important = function(diagram, text, x, y, alignment, font, fill) {
        var a = aOrient[this.coords[2] * 9 + alignment];
        diagram.c.textAlign = textAlign[a];
        diagram.c.textBaseline = textBaseline[a];
        if (fill === undefined) diagram.c.fillStyle = this.selected ? diagram.selected_style : diagram.normal_style;
        else diagram.c.fillStyle = fill;
        diagram.draw_text_important(text,
                                    this.transform_x(x, y) + this.coords[0],
                                    this.transform_y(x, y) + this.coords[1],
                                    font);
    };

    Component.prototype.draw = function(diagram) {
        // see if icon has been defined recently...
        if (this.icon === undefined) this.compute_bbox();

        if (this.icon && !this.icon.empty()) {
            var component = this; // for closure
            this.icon.map_over_components(function(c) {
                c.draw_icon(component, diagram);
            });
        }
        else this.draw_text_important(diagram, this.type, 0, 0, 4, diagram.annotation_font);
    };

    // does mouse click fall on this component?
    Component.prototype.near = function(x, y) {
        return this.inside(x, y);
    };

    Component.prototype.select = function(x, y, shiftKey) {
        this.was_previously_selected = this.selected;
        if (this.near(x, y)) {
            this.set_select(shiftKey ? !this.selected : true);
            return true;
        }
        else return false;
    };

    Component.prototype.select_rect = function(s) {
        if (intersect(this.bbox, s)) this.set_select(true);
    };

    // default: do nothing
    Component.prototype.bisect = function(c) {};

    // clear the labels on all connections
    Component.prototype.clear_labels = function() {
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            this.connections[i].clear_label();
        }
    };

    // default action: don't propagate label
    Component.prototype.propagate_label = function(label) {};

    // component should generate labels for all unlabeled connections
    Component.prototype.label_connections = function(prefix) {
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            var cp = this.connections[i];
            if (!cp.label) {
                // generate label of appropriate length
                var len = cp.nlist.length;
                var label = [];
                for (var j = 0; j < len; j += 1) {
                    label.push(this.aspect.get_next_label(prefix));
                }
                cp.propagate_label(label);
            }
        }
    };

    // give components a chance to generate a label for their connection(s).
    // valid for any component with a "global_signal" or "signal" property
    // (e.g., gnd, vdd, ports, wires).
    Component.prototype.add_default_labels = function(prefix, port_map) {
        var nlist, i;

        if (this.properties.global_signal)
            // no mapping or prefixing for global signals
            nlist = parse_signal(this.properties.global_signal);
        else {
            nlist = parse_signal(this.properties.signal);
            if (nlist.length > 0) {
                // substitute external names for local labels that are connected to ports
                // or add prefix to local labels
                for (i = 0; i < nlist.length; i += 1) {
                    var n = nlist[i];
                    if (n in port_map) nlist[i] = port_map[n];
                    else nlist[i] = prefix + n;
                }
            }
        }

        // now actually propagate label to connections (we're expecting only
        // only one connection for all but wires which will have two).
        if (nlist.length > 0) for (i = 0; i < this.connections.length; i += 1) {
            this.connections[i].propagate_label(nlist);
        }
    };

    // netlist entry: ["type", {terminal:signal, ...}, {property: value, ...}]
    Component.prototype.netlist = function(mlist, prefix) {
        var i;
        
        // match up connections to the component's terminals, determine
        // the number of instances implied by the connections.
        var connections = [];
        var ninstances = 1; // always at least one instance
        for (i = 0; i < this.connections.length; i += 1) {
            var c = this.connections[i];
            var got = c.label.length;
            var expected = c.nlist.length;
            if ((got % expected) !== 0) {
                throw "Number of connections for terminal " + c.name + "of " + this.prefix + this.properties.name + " not a multiple of " + expected.toString();
            }

            // infer number of instances and remember the max we find.
            // we'll replicate connections if necessary during the
            // expansion phase.
            ninstances = Math.max(ninstances, got / expected);

            // remember for expansion phase
            connections.push([c.nlist, c.label]);
        }

        // now create the appropriate number of instances
        var netlist = [];
        for (i = 0; i < ninstances; i += 1) {
            // build port map
            var port_map = {};
            for (var j = 0; j < connections.length; j += 1) {
                var nlist = connections[j][0]; // list of terminal names
                var slist = connections[j][1]; // list of connected signals
                var sindex = i * nlist.length; // where to start in slist
                for (var k = 0; k < nlist.length; k += 1)
                    // keep cycling through entries in slist as necessary
                    port_map[nlist[k]] = slist[(sindex + k) % slist.length];
            }

            if (mlist.indexOf(this.type) != -1) {
                // if leaf, create netlist entry
                var props = this.clone_properties(false);
                props.name = prefix + this.name;
                if (ninstances > 1) props.name += '[' + i.toString() + ']';
                netlist.push([this.type, port_map, props]);
                continue;
            }

            if (this.has_aspect('schematic')) {
                var sch = this.module.aspect('schematic');
                // extract component's schematic, add to our netlist
                var p = prefix + this.name;
                if (ninstances > 1) p += '[' + i.toString() + ']';
                p += '.'; // hierarchical name separator
                var result = sch.netlist(mlist, p, port_map);
                netlist.push.apply(netlist, result);
            }
            else {
                // if no schematic, complain
                throw "No schematic for " + prefix + this.properties.name + " an instance of " + this.type;
            }

        }
        return netlist;
    };

    Component.prototype.update_properties = function(new_properties) {
        if (new_properties !== undefined) {
            var old_properties = this.clone_properties(false);
            this.properties = new_properties;

            var component = this; // for closure
            this.aspect.add_change(function(diagram, action) {
                if (action == 'undo') component.properties = old_properties;
                else component.properties = new_properties;
            });
        }
    };

    Component.prototype.edit_properties = function(diagram, x, y, callback) {
        if (this.near(x, y) && Object.keys(this.properties).length > 0) {
            // make the appropriate input widget for each property
            var fields = {};
            for (var p in this.properties) {
                var mprop = this.module.properties[p];
                if (mprop.edit == 'no') continue; // skip uneditable props

                var lbl = mprop.label || p; // use provided label
                var input;
                if (mprop.type == 'menu') input = build_select(mprop.choices, this.properties[p]);
                else {
                    var v = this.properties[p];
                    input = build_input('text', Math.max(10, (v === undefined ? 1 : v.length) + 5), this.properties[p]);
                }
                input.prop_name = p;
                fields[lbl] = input;
            }

            var content = build_table(fields);
            var component = this;

            diagram.dialog('Edit Properties', content, function() {
                var new_properties = {};
                for (var i in fields) {
                    var v = fields[i].value;
                    if (v === '') v = undefined;
                    new_properties[fields[i].prop_name] = v;
                }
                component.name = new_properties.name; // used when extracting netlists

                // record the change
                diagram.aspect.start_action();
                component.update_properties(new_properties);
                diagram.aspect.end_action();

                if (callback) callback(component);

                diagram.redraw_background();
            });
            return true;
        }
        else return false;
    };

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Connection point
    //
    ////////////////////////////////////////////////////////////////////////////////

    var connection_point_radius = 2;

    function ConnectionPoint(parent, x, y, name) {
        this.parent = parent;
        this.offset_x = x;
        this.offset_y = y;
        this.name = name;
        this.nlist = parse_signal(name);
        this.location = '';
        this.update_location();
        this.label = undefined;
    }

    ConnectionPoint.prototype.clear_label = function() {
        this.label = undefined;
    };

    // return number of connection points coincidient with this one
    ConnectionPoint.prototype.nconnections = function() {
        var cplist = this.parent.aspect.connection_points[this.location];
        return cplist.length;
    };

    ConnectionPoint.prototype.propagate_label = function(label) {
        // should we check if existing label is the same?  it should be...

        if (this.label === undefined) {
            // label this connection point
            this.label = label;

            // propagate label to coincident connection points
            this.parent.aspect.propagate_label(label, this.location);

            // possibly label other cp's for this device?
            this.parent.propagate_label(label);
        }
        else if (!signal_equals(this.label, label))
            // signal an error while generating netlist
            throw "Node has two conflicting sets of labels: [" + this.label + "], [" + label + "]";
    };

    ConnectionPoint.prototype.update_location = function() {
        // update location string which we use as a key to find coincident connection points
        var old_location = this.location;
        var parent = this.parent;
        var nx = parent.transform_x(this.offset_x, this.offset_y) + parent.coords[0];
        var ny = parent.transform_y(this.offset_x, this.offset_y) + parent.coords[1];
        this.x = nx;
        this.y = ny;
        this.location = nx + ',' + ny;

        // add ourselves to the connection list for the new location
        if (this.parent.aspect) this.parent.aspect.update_connection_point(this, old_location);
    };

    ConnectionPoint.prototype.coincident = function(x, y) {
        return this.x == x && this.y == y;
    };

    ConnectionPoint.prototype.draw = function(diagram, n) {
        if (n != 2) this.parent.draw_circle(diagram, this.offset_x, this.offset_y,
                                            connection_point_radius, n > 2);
    };

    ConnectionPoint.prototype.draw_x = function(diagram) {
        this.parent.draw_line(diagram, this.offset_x - 2, this.offset_y - 2,
                              this.offset_x + 2, this.offset_y + 2, diagram.grid_style);
        this.parent.draw_line(diagram, this.offset_x + 2, this.offset_y - 2,
                              this.offset_x - 2, this.offset_y + 2, diagram.grid_style);
    };

    // see if three connection points are collinear
    function collinear(p1, p2, p3) {
        // from http://mathworld.wolfram.com/Collinear.html
        var area = p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y);
        return area === 0;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Diagram editor base class
    //
    //////////////////////////////////////////////////////////////////////

    function Diagram(editor, class_name) {
        this.editor = editor;
        this.aspect = undefined;

        // setup canas
        this.canvas = $('<canvas></canvas>').addClass(class_name)[0];

        // handle retina devices properly
        var context = this.canvas.getContext('2d');
        var devicePixelRatio = window.devicePixelRatio || 1;
        var backingStoreRatio = context.webkitBackingStorePixelRatio ||
            context.mozBackingStorePixelRatio ||
            context.msBackingStorePixelRatio ||
            context.oBackingStorePixelRatio ||
            context.backingStorePixelRatio || 1;
        this.pixelRatio = devicePixelRatio / backingStoreRatio;

        this.sctl_r = 16; // scrolling control parameters
        this.sctl_x = this.sctl_r + 8; // upper left
        this.sctl_y = this.sctl_r + 8;
        this.zctl_left = this.sctl_x - 8;
        this.zctl_top = this.sctl_y + this.sctl_r + 8;

        // ethanschoonover.com
        this.background_style = 'rgb(250,250,250)'; // backgrund color for diagram [base3]
        this.grid_style = 'rgb(230,230,230)'; // grid on background
        this.control_style = 'rgb(180,180,180)'; // grid on background [base1]
        this.normal_style = 'rgb(88,110,117)'; // default drawing color [base01]
        this.component_style = 'rgb(38,139,210)'; // color for unselected components [blue]
        this.selected_style = 'rgb(211,54,130)'; // highlight color for selected components [magenta]
        this.annotation_style = 'rgb(220,50,47)'; // color for diagram annotations [red]

        this.property_font = '5pt sans-serif'; // point size for Component property text
        this.annotation_font = '6pt sans-serif'; // point size for diagram annotations

        // repaint simply draws this buffer and then adds selected elements on top
        this.bg_image = $('<canvas></canvas>')[0];
        this.bg_image.getContext('2d').scale(this.pixelRatio,this.pixelRatio);

        this.canvas.tabIndex = 1; // so we get keystrokes

        this.canvas.diagram = this;

        // initial state
        this.dragging = false;
        this.select_rect = undefined;
        this.annotations = [];
        this.show_grid = true;

        this.origin_x = 0;
        this.origin_y = 0;
        this.cursor_x = 0;
        this.cursor_y = 0;
        this.unsel_bbox = [Infinity, Infinity, - Infinity, - Infinity];
        this.bbox = [0, 0, 0, 0];
    }

    Diagram.prototype.netlist = function(mlist) {
        try {
            var netlist = this.aspect.netlist(mlist, '', {});
            return netlist;
        }
        catch (e) {
            //throw e;  // for debugging
            alert("Error extracting netlist:\n\n" + e);
            return [];
        }
    };

    // fetch attributes from the tag that created us
    Diagram.prototype.getAttribute = function(attr) {
        return undefined;
    };

    Diagram.prototype.set_aspect = function(aspect) {
        this.aspect = aspect;
        this.redraw_background(); // compute bounding box
        this.zoomall(); // let's see the whole diagram
    };

    Diagram.prototype.unselect_all = function(which) {
        this.annotations = []; // remove all annotations

        this.aspect.map_over_components(function(c, i) {
            if (i != which) c.set_select(false);
        });
    };

    Diagram.prototype.remove_annotations = function() {
        this.unselect_all();
        this.redraw_background();
    };

    Diagram.prototype.add_annotation = function(callback) {
        this.annotations.push(callback);
        this.redraw();
    };

    Diagram.prototype.drag_begin = function() {
        // let components know they're about to move
        var cursor_grid = 1;
        this.aspect.map_over_components(function(c) {
            if (c.selected) {
                c.move_begin();
                cursor_grid = Math.max(cursor_grid, c.required_grid);
            }
        });
        this.set_cursor_grid(cursor_grid);

        // remember where drag started
        this.drag_x = this.cursor_x;
        this.drag_y = this.cursor_y;
        this.dragging = true;
    };

    Diagram.prototype.drag_end = function() {
        // let components know they're done moving
        this.aspect.map_over_components(function(c) {
            if (c.selected) c.move_end();
        });
        this.dragging = false;
        this.aspect.end_action();
        this.redraw_background();
    };

    Diagram.prototype.zoomin = function() {
        var nscale = this.scale * this.zoom_factor;

        if (nscale < this.zoom_max) {
            // keep center of view unchanged
            this.origin_x += (this.canvas.clientWidth / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.origin_y += (this.canvas.clientHeight / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.scale = nscale;
            this.redraw_background();
        }
    };

    Diagram.prototype.zoomout = function() {
        var nscale = this.scale / this.zoom_factor;

        if (nscale > this.zoom_min) {
            // keep center of view unchanged
            this.origin_x += (this.canvas.clientWidth / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.origin_y += (this.canvas.clientHeight / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.scale = nscale;
            this.redraw_background();
        }
    };

    Diagram.prototype.zoomall = function() {
        // w,h for diagram including a margin on all sides
        var diagram_w = 1.5 * (this.bbox[2] - this.bbox[0]);
        var diagram_h = 1.5 * (this.bbox[3] - this.bbox[1]);

        if (diagram_w === 0) this.scale = 1;
        else {
            // compute scales that would make diagram fit, choose smallest
            var scale_x = this.canvas.clientWidth / diagram_w;
            var scale_y = this.canvas.clientHeight / diagram_h;
            this.scale = Math.pow(this.zoom_factor,
                                  Math.ceil(Math.log(Math.min(scale_x, scale_y)) / Math.log(this.zoom_factor)));
            if (this.scale < this.zoom_min) this.scale = this.zoom_min;
            else if (this.scale > this.zoom_max) this.scale = this.zoom_max;
        }

        // center the diagram
        this.origin_x = (this.bbox[2] + this.bbox[0]) / 2 - this.canvas.clientWidth / (2 * this.scale);
        this.origin_y = (this.bbox[3] + this.bbox[1]) / 2 - this.canvas.clientHeight / (2 * this.scale);

        this.redraw_background();
    };

    function diagram_undo(diagram) {
        diagram.aspect.undo();
        diagram.unselect_all(-1);
        diagram.redraw_background();
    }

    function diagram_redo(diagram) {
        diagram.aspect.redo();
        diagram.unselect_all(-1);
        diagram.redraw_background();
    }

    function diagram_cut(diagram) {
        // clear previous contents
        clipboards[diagram.editor.editor_name] = [];

        // look for selected components, move them to clipboard.
        diagram.aspect.start_action();
        diagram.aspect.map_over_components(function(c) {
            if (c.selected) {
                c.remove();
                clipboards[diagram.editor.editor_name].push(c);
            }
        });
        diagram.aspect.end_action();

        // update diagram view
        diagram.redraw();
    }

    function diagram_copy(diagram) {
        // clear previous contents
        clipboards[diagram.editor.editor_name] = [];

        // look for selected components, copy them to clipboard.
        diagram.aspect.map_over_components(function(c) {
            if (c.selected) clipboards[diagram.editor.editor_name].push(c.clone(c.coords[0], c.coords[1]));
        });

        diagram.redraw(); // digram didn't change, but toolbar status may have
    }

    function diagram_paste(diagram) {
        var clipboard = clipboards[diagram.editor.editor_name];
        var i, c;

        // compute left,top of bounding box for origins of
        // components in the clipboard
        var left;
        var top;
        var cursor_grid = 1;
        for (i = clipboard.length - 1; i >= 0; i -= 1) {
            c = clipboard[i];
            left = left ? Math.min(left, c.coords[0]) : c.coords[0];
            top = top ? Math.min(top, c.coords[1]) : c.coords[1];
            cursor_grid = Math.max(cursor_grid, c.required_grid);
        }
        diagram.set_cursor_grid(cursor_grid);
        left = diagram.on_grid(left);
        top = diagram.on_grid(top);

        // clear current selections
        diagram.unselect_all(-1);
        diagram.redraw_background(); // so we see any components that got unselected

        // make clones of components on the clipboard, positioning
        // them relative to the cursor
        diagram.aspect.start_action();
        for (i = clipboard.length - 1; i >= 0; i -= 1) {
            c = clipboard[i];
            var new_c = c.clone(diagram.cursor_x + (c.coords[0] - left), diagram.cursor_y + (c.coords[1] - top));
            new_c.set_select(true);
            new_c.add(diagram.aspect);
        }
        diagram.aspect.end_action();

        // see what we've wrought
        diagram.redraw();
    }

    Diagram.prototype.set_cursor_grid = function(g) {
        this.cursor_grid = g;
        this.cursor_x = this.on_grid(this.aspect_x);
        this.cursor_y = this.on_grid(this.aspect_y);
    };

    // determine nearest grid point
    Diagram.prototype.on_grid = function(v, grid) {
        if (grid === undefined) grid = this.cursor_grid;
        if (v < 0) return Math.floor((-v + (grid >> 1)) / grid) * -grid;
        else return Math.floor((v + (grid >> 1)) / grid) * grid;
    };

    // rotate selection about center of its bounding box
    Diagram.prototype.rotate = function(rotation) {
        var bbox = this.aspect.selected_bbox();
        var grid = this.aspect.selected_grid();

        // compute center of bounding box, ensure it's on grid
        var cx = this.on_grid((bbox[0] + bbox[2]) >> 1, grid);
        var cy = this.on_grid((bbox[1] + bbox[3]) >> 1, grid);

        this.aspect.start_action();

        // rotate each selected component relative center of bbox
        this.aspect.map_over_components(function(c) {
            if (c.selected) {
                c.move_begin();
                c.rotate(rotation, cx, cy);
            }
        });

        // to prevent creep, recompute bounding box and move
        // to old center
        bbox = this.aspect.selected_bbox();
        var dx = cx - this.on_grid((bbox[0] + bbox[2]) >> 1, grid);
        var dy = cy - this.on_grid((bbox[1] + bbox[3]) >> 1, grid);
        this.aspect.map_over_components(function(c) {
            if (c.selected) {
                if (dx !== 0 || dy !== 0) c.move(dx, dy);
                c.move_end();
            }
        });
        this.aspect.end_action();
        this.redraw();
    };

    // flip selection horizontally
    function diagram_fliph(diagram) {
        diagram.rotate(4);
    }

    // flip selection vertically
    function diagram_flipv(diagram) {
        diagram.rotate(6);
    }

    // rotate selection clockwise
    function diagram_rotcw(diagram) {
        diagram.rotate(1);
    }

    // rotate selection counterclockwise
    function diagram_rotccw(diagram) {
        diagram.rotate(3);
    }

    Diagram.prototype.resize = function() {
        var w = this.canvas.clientWidth;
        var h = this.canvas.clientHeight;

        this.canvas.width = w*this.pixelRatio;
        this.canvas.height = h*this.pixelRatio;
        // after changing dimension, have to reset context 
        this.canvas.getContext('2d').scale(this.pixelRatio,this.pixelRatio);

        this.bg_image.width = w*this.pixelRatio;
        this.bg_image.height = h*this.pixelRatio;
        this.bg_image.getContext('2d').scale(this.pixelRatio,this.pixelRatio);

        this.zoomall();
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Drawing support -- deals with scaling and scrolling of diagrams
    //
    ////////////////////////////////////////////////////////////////////////////////

    // here to redraw background image containing static portions of the diagram
    // Also redraws dynamic portion.
    Diagram.prototype.redraw_background = function() {
        var c = this.bg_image.getContext('2d');
        this.c = c;

        c.lineCap = 'round';

        // paint background color -- use color from style sheet
        c.fillStyle = this.background_style;
        c.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

        if (!this.diagram_only && this.show_grid) {
            // grid
            c.strokeStyle = this.grid_style;
            var first_x = this.origin_x;
            var last_x = first_x + this.canvas.clientWidth / this.scale;
            var first_y = this.origin_y;
            var last_y = first_y + this.canvas.clientHeight / this.scale;
            var i;

            for (i = this.grid * Math.ceil(first_x / this.grid); i < last_x; i += this.grid) {
                this.draw_line(i, first_y, i, last_y, 0.2);
            }

            for (i = this.grid * Math.ceil(first_y / this.grid); i < last_y; i += this.grid) {
                this.draw_line(first_x, i, last_x, i, 0.2);
            }

            // indicate origin
            this.draw_arc(0, 0, this.grid / 2, 0, 2 * Math.PI, false, 0.2, false);
        }

        // unselected components
        this.unsel_bbox = this.aspect.unselected_bbox();

        var diagram = this; // for closure below
        this.aspect.map_over_components(function(c) {
            if (!c.selected) c.draw(diagram);
        });

        this.redraw(); // background changed, redraw on screen
    };

    // redraw what user sees = static image + dynamic parts
    Diagram.prototype.redraw = function() {
        var c = this.canvas.getContext('2d');
        this.c = c;

        // put static image in the background
        c.drawImage(this.bg_image, 0, 0);

        // selected components
        this.bbox = this.aspect.selected_bbox(this.unsel_bbox);
        if (this.bbox[0] == Infinity) this.bbox = [0, 0, 0, 0];

        var diagram = this; // for closure below
        this.aspect.map_over_components(function(c) {
            if (c.selected) c.draw(diagram);
        });


        var toolbar = this.editor.toolbar;
        if (toolbar) toolbar.enable_tools(this);

        // connection points: draw one at each location
        for (var location in this.aspect.connection_points) {
            var cplist = this.aspect.connection_points[location];
            cplist[0].draw(this, cplist.length);
        }

        // draw editor-specific dodads
        this.editor.redraw(this);

        // draw selection rectangle
        if (this.select_rect) {
            var t = this.select_rect;
            c.lineWidth = 1;
            c.strokeStyle = this.selected_style;
            c.beginPath();
            c.moveTo(t[0], t[1]);
            c.lineTo(t[0], t[3]);
            c.lineTo(t[2], t[3]);
            c.lineTo(t[2], t[1]);
            c.lineTo(t[0], t[1]);
            c.stroke();
        }

        // add any annotations
        for (var i = 0; i < this.annotations.length; i += 1) {
            // annotations are callbacks that get a chance to do their thing
            this.annotations[i](this);
        }

        // add scrolling/zooming control
        var r = this.sctl_r;
        var x = this.sctl_x;
        var y = this.sctl_y;

        // circle with border
        c.fillStyle = this.background_style;
        c.beginPath();
        c.arc(x, y, r, 0, 2 * Math.PI);
        c.fill();

        c.strokeStyle = this.control_style;
        c.lineWidth = 0.5;
        c.beginPath();
        c.arc(x, y, r, 0, 2 * Math.PI);
        c.stroke();

        // direction markers for scroll
        c.lineWidth = 3;
        c.beginPath();

        c.moveTo(x + 4, y - r + 8); // north
        c.lineTo(x, y - r + 4);
        c.lineTo(x - 4, y - r + 8);

        c.moveTo(x + r - 8, y + 4); // east
        c.lineTo(x + r - 4, y);
        c.lineTo(x + r - 8, y - 4);

        c.moveTo(x + 4, y + r - 8); // south
        c.lineTo(x, y + r - 4);
        c.lineTo(x - 4, y + r - 8);

        c.moveTo(x - r + 8, y + 4); // west
        c.lineTo(x - r + 4, y);
        c.lineTo(x - r + 8, y - 4);

        c.stroke();

        // zoom control
        x = this.zctl_left;
        y = this.zctl_top;
        c.lineWidth = 0.5;
        c.fillStyle = this.background_style; // background
        c.fillRect(x, y, 16, 48);
        c.strokeStyle = this.control_style; // border
        c.strokeRect(x, y, 16, 48);
        c.lineWidth = 1.0;
        c.beginPath();
        // zoom in label
        c.moveTo(x + 4, y + 8);
        c.lineTo(x + 12, y + 8);
        c.moveTo(x + 8, y + 4);
        c.lineTo(x + 8, y + 12);
        // zoom out label
        c.moveTo(x + 4, y + 24);
        c.lineTo(x + 12, y + 24);
        c.stroke();
        // surround label
        c.strokeRect(x + 4, y + 36, 8, 8);
        c.fillStyle = this.background_style;
        c.fillRect(x + 7, y + 34, 2, 10);
        c.fillRect(x + 3, y + 39, 10, 2);
    };

    Diagram.prototype.moveTo = function(x, y) {
        var xx = Math.floor((x - this.origin_x) * this.scale);
        var yy = Math.floor((y - this.origin_y) * this.scale);
        if ((this.c.lineWidth & 1) == 1) {
            // odd line width, offset to avoid fuzziness
            xx += 0.5;
            yy += 0.5;
        }
        this.c.moveTo(xx,yy);
    };

    Diagram.prototype.lineTo = function(x, y) {
        var xx = Math.floor((x - this.origin_x) * this.scale);
        var yy = Math.floor((y - this.origin_y) * this.scale);
        if ((this.c.lineWidth & 1) == 1) {
            // odd line width, offset to avoid fuzziness
            xx += 0.5;
            yy += 0.5;
        }
        this.c.lineTo(xx,yy);
    };

    Diagram.prototype.line_width = function(width) {
        // integer line widths help us avoid the horrors of antialiasing on H and V lines
        return Math.max(1,Math.floor(width * this.scale));
    };

    Diagram.prototype.draw_line = function(x1, y1, x2, y2, width) {
        var c = this.c;
        c.lineWidth = this.line_width(width);
        c.beginPath();
        this.moveTo(x1,y1);
        this.lineTo(x2,y2);
        c.stroke();
    };

    Diagram.prototype.draw_arc = function(x, y, radius, start_radians, end_radians, anticlockwise, width, filled) {
        var c = this.c;
        c.lineWidth = this.line_width(width);
        c.beginPath();
        var xx = Math.floor((x - this.origin_x) * this.scale);
        var yy = Math.floor((y - this.origin_y) * this.scale);
        if ((this.c.lineWidth & 1) == 1) {
            // odd line width, offset to avoid fuzziness => match lines
            xx += 0.5;
            yy += 0.5;
        }
        c.arc(xx, yy, radius * this.scale, start_radians, end_radians, anticlockwise);
        if (filled) c.fill();
        else c.stroke();
    };

    Diagram.prototype.draw_text = function(text, x, y, font) {
        var c = this.c;

        // scale font size appropriately
        var s = font.match(/\d+/)[0];
        s = Math.max(2, Math.round(s * this.scale));
        c.font = font.replace(/\d+/, s.toString());

        var xx = Math.floor((x - this.origin_x) * this.scale);
        var yy = Math.floor((y - this.origin_y) * this.scale);
        c.fillText(text, xx, yy);
    };

    Diagram.prototype.draw_text_important = function(text, x, y, font) {
        this.draw_text(text, x, y, font);
    };

    // convert event coordinates into
    //   mouse_x,mouse_y = coords relative to upper left of canvas
    //   aspect_x,aspect_y = coords in aspect's coordinate system
    //   cursor_x,cursor_y = aspect coords rounded to nearest grid point
    Diagram.prototype.event_coords = function(event) {
        var pos = $(this.canvas).offset();
        this.mouse_x = event.pageX - pos.left;
        this.mouse_y = event.pageY - pos.top;
        this.aspect_x = this.mouse_x / this.scale + this.origin_x;
        this.aspect_y = this.mouse_y / this.scale + this.origin_y;
        this.cursor_x = this.on_grid(this.aspect_x);
        this.cursor_y = this.on_grid(this.aspect_y);
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Event handling
    //
    ////////////////////////////////////////////////////////////////////////////////

    // process keystrokes, consuming those that are meaningful to us
    Diagram.prototype.key_down = function(event) {
        var code = event.keyCode;

        // backspace or delete: delete selected components
        if (code == 8 || code == 46) {
            // delete selected components
            this.aspect.start_action();
            this.aspect.map_over_components(function(c) {
                if (c.selected) c.remove();
            });
            this.aspect.end_action();
            this.redraw_background();
        }

        // cmd/ctrl a: select all
        else if ((event.ctrlKey || event.metaKey) && code == 65) {
            this.aspect.map_over_components(function(c) {
                c.set_select(true);
            });
            this.redraw_background();
        }

        // cmd/ctrl c: copy
        else if ((event.ctrlKey || event.metaKey) && code == 67) {
            diagram_copy(this);
        }

        // cmd/ctrl v: paste
        else if ((event.ctrlKey || event.metaKey) && code == 86) {
            diagram_paste(this);
        }

        // cmd/ctrl x: cut
        else if ((event.ctrlKey || event.metaKey) && code == 88) {
            diagram_cut(this);
        }

        // cmd/ctrl y: redo
        else if ((event.ctrlKey || event.metaKey) && code == 89) {
            diagram_redo(this);
        }

        // cmd/ctrl z: undo
        else if ((event.ctrlKey || event.metaKey) && code == 90) {
            diagram_undo(this);
        }

        else return true;

        event.preventDefault();
        return false;
    };

    // handle events in pan/zoom control
    Diagram.prototype.pan_zoom = function() {
        var mx = this.mouse_x;
        var my = this.mouse_y;
        var sx = mx - this.sctl_x;
        var sy = my - this.sctl_y;
        var zx = mx - this.zctl_left;
        var zy = my - this.zctl_top;
        var delta,temp;
        
        if (sx * sx + sy * sy <= this.sctl_r * this.sctl_r) { // click in scrolling control
            // click on scrolling control, check which quadrant
            if (Math.abs(sy) > Math.abs(sx)) { // N or S
                delta = this.canvas.height / (8 * this.scale);
                if (sy > 0) delta = -delta;
                temp = this.origin_y - delta;
                if (temp > this.origin_min * this.grid && temp < this.origin_max * this.grid) this.origin_y = temp;
            }
            else { // E or W
                delta = this.canvas.width / (8 * this.scale);
                if (sx < 0) delta = -delta;
                temp = this.origin_x + delta;
                if (temp > this.origin_min * this.grid && temp < this.origin_max * this.grid) this.origin_x = temp;
            }
        }
        else if (zx >= 0 && zx < 16 && zy >= 0 && zy < 48) { // click in zoom control
            if (zy < 16) this.zoomin();
            else if (zy < 32) this.zoomout();
            else this.zoomall();
        }
        else return false;

        this.redraw_background();
        return true;
    };

    // handle the (possible) start of a selection
    Diagram.prototype.start_select = function(shiftKey) {
        // give all components a shot at processing the selection event
        var which = -1;
        var diagram = this; // for closure
        this.aspect.map_over_components(function(c, i) {
            if (c.select(diagram.aspect_x, diagram.aspect_y, shiftKey)) {
                if (c.selected) {
                    diagram.aspect.start_action();
                    diagram.drag_begin();
                    which = i; // keep track of component we found
                }
                return true;
            }
            return false;
        });

        if (!shiftKey) {
            // did we just click on a previously selected component?
            var reselect = which != -1 && this.aspect.components[which].was_previously_selected;

            // if shift key isn't pressed and we didn't click on component
            // that was already selected, unselect everyone except component
            // we just clicked on
            if (!reselect) this.unselect_all(which);

            // if there's nothing to drag, set up a selection rectangle
            if (!this.dragging) this.select_rect = [this.mouse_x, this.mouse_y,
                                                    this.mouse_x, this.mouse_y];
        }

        this.redraw_background();
    };

    // handle dragging and selection rectangle
    Diagram.prototype.mouse_move = function() {
        if (this.dragging) {
            // see how far we moved
            var dx = this.cursor_x - this.drag_x;
            var dy = this.cursor_y - this.drag_y;
            if (dx !== 0 || dy !== 0) {
                // update position for next time
                this.drag_x = this.cursor_x;
                this.drag_y = this.cursor_y;

                // give all components a shot at processing the event
                this.aspect.map_over_components(function(c) {
                    if (c.selected) c.move(dx, dy);
                });
            }
        }
        else if (this.select_rect) {
            // update moving corner of selection rectangle
            this.select_rect[2] = this.mouse_x;
            this.select_rect[3] = this.mouse_y;
        }

        // just redraw dynamic components
        this.redraw();
    };

    // handle dragging and selection rectangle
    Diagram.prototype.mouse_up = function(shiftKey) {
        // dragging
        if (this.dragging) this.drag_end();

        // selection rectangle
        if (this.select_rect) {
            var r = this.select_rect;

            // if select_rect is a point, we've already dealt with selection
            // in mouse_down handler
            if (r[0] != r[2] || r[1] != r[3]) {
                // convert to diagram coordinates
                var s = [r[0] / this.scale + this.origin_x, r[1] / this.scale + this.origin_y,
                         r[2] / this.scale + this.origin_x, r[3] / this.scale + this.origin_y];
                canonicalize(s);

                if (!shiftKey) this.unselect_all();

                // select components that intersect selection rectangle
                this.aspect.map_over_components(function(c) {
                    c.select_rect(s, shiftKey);
                });
            }

            this.select_rect = undefined;
            this.redraw_background();
        }
    };

    Diagram.prototype.message = function(message) {
        var status = this.editor.status;

        if (status) status.text(message);
    };

    Diagram.prototype.clear_message = function(message) {
        var status = this.editor.status;

        if (status && status.text() == message) status.text('');
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Dialogs and windows
    //
    ////////////////////////////////////////////////////////////////////////////////

    Diagram.prototype.dialog = function(title, content, callback) {
        // position top,left of window where mouse is.  mouse_x and mouse_y
        // are relative to the canvas, so use its offset to figure things out
        var coffset = $(this.canvas).offset();
        coffset.top += this.mouse_y;
        coffset.left += this.mouse_x;

        dialog(title, content, callback, coffset);
    };

    Diagram.prototype.window = function(title, content, offset) {
        // position top,left of window where mouse is.  mouse_x and mouse_y
        // are relative to the canvas, so use its offset to figure things out
        var coffset = $(this.canvas).offset();
        coffset.top += this.mouse_y + (offset || 0);
        coffset.left += this.mouse_x + (offset || 0);

        jade_window(title,content,coffset);
    };

    // set up a dialog with specified title, content and two buttons at
    // the bottom: OK and Cancel.  If Cancel is clicked, dialog goes away
    // and we're done.  If OK is clicked, dialog goes away and the
    // callback function is called with the content as an argument (so
    // that the values of any fields can be captured).
    function dialog(title, content, callback, offset) {
        // create the div for the top level of the dialog, add to DOM
        var dialog = $('<div>' +
                       ' <div class="jade-dialog-content"></div>' +
                       ' <div class="jade-dialog-buttons">' +
                       '  <span id="ok" class="jade-dialog-button">OK</span>' +
                       '  <span id="cancel" class="jade-dialog-button">Cancel</span></div>' +
                       '</div>');

        dialog[0].callback = callback;

        // look for property input fields in the content and give
        // them a keypress listener that interprets ENTER as
        // clicking OK.
        var focus;  // remember field to get initial focus
        $(content).find('.property').each(function (i,field) {
            var f = $(field);
            if (i == 0) focus = f;
            field.dialog = dialog[0]; // help event handler find us...

            // if user hits enter, it counts as clicking OK
            f.keypress(function (event) {
                if (event.keyCode == 13) dialog.find('#ok').trigger('click');
            });
            // select entire contents of <input> when it gets focus
            f.focus(function () {
                this.select();
            });
        });

        // fill in body element, set up click handlers
        dialog.find('.jade-dialog-content').append(content);

        dialog.find('#ok').on('click',function () {
            window_close(dialog[0].win);

            // invoke the callback with the dialog contents as the argument.
            // small delay allows browser to actually remove window beforehand
            if (dialog[0].callback) setTimeout(function() {
                dialog[0].callback();
            }, 1);
        });

        dialog.find('#cancel').on('click',function () {
            window_close(dialog[0].win);
        });

        // put into an overlay window
        jade_window(title, dialog[0], offset);

        // give initial focus to first property's <input> 
        if (focus) focus.focus();
    };

    // build a 2-column HTML table from an associative array (keys as text in
    // column 1, values in column 2).
    function build_table(a) {
        var tbl = $('<table></table>');

        // build a row for each element in associative array
        for (var i in a) {
            var row = $('<tr valign="center"><td><nobr>'+i+' :</nobr></td><td id="field"></td></tr>');
            row.find('#field').append(a[i]);
            tbl.append(row);
        }

        return tbl[0];
    }

    function build_button(label, callback) {
        var button = $('<button>'+label+'</button>').click(callback);
        return button[0];
    }

    // build an input field
    function build_input(type, size, value) {
        var input = $('<input class="property"></input>').attr('type',type).attr('size',size);
        input.val(value === undefined ? '' : value.toString());
        return input[0];
    }

    // build a select widget using the strings found in the options array
    function build_select(options, selected, select) {
        if (select === undefined) select = $('<select></select>');
        else select = $(select);
        for (var i = 0; i < options.length; i += 1) {
            var option = $('<option>'+options[i]+'</option>');
            select.append(option);
            if (options[i] == selected) option.attr('selected','true');
        }
        return select[0];
    }

    var window_list = [];

    function jade_window(title, content, offset) {
        // create the div for the top level of the window
        var win = $('<div class="jade-window">'+
                    ' <div class="jade-window-title">' + title + '<img style="float: right"></img></div>' +
                    '</div>');
        win[0].content = content;
        win[0].drag_x = undefined;
        win[0].draw_y = undefined;

        var head = win.find('.jade-window-title').mousedown(window_mouse_down);
        head[0].win = win[0];
        win[0].head = head[0];

        var close_button = win.find('img').click(window_close_button).attr('src',close_icon);
        close_button[0].win = win[0];

        win.append($(content));
        content.win = win[0]; // so content can contact us
        $(content).toggleClass('jade-window-contents');

        if (content.resize) {
            var resize = $('<img class="jade-window-resize"></img>');
            resize.attr('src',resize_icon);
            resize[0].win = win;
            win[0].resize = function(dx, dy) {
                // change size of window and content
                var e = win;
                e.height(e.height() + dy);
                e.width(e.width() + dx);

                // let contents know new size
                e = $(content);
                content.resize(content, e.width() + dx, e.height() + dy);
            };
            resize.mousedown(window_resize_start);
            win.append(resize);
        }

        $('body').append(win);

        // position top,left of window where mouse is.  mouse_x and mouse_y
        // are relative to the canvas, so use its offset to figure things out
        win.offset(offset);
        bring_to_front(win[0], true);
        return win;
    };

    // adjust zIndex of pop-up window so that it is in front
    function bring_to_front(win, insert) {
        var i = window_list.indexOf(win);

        // remove from current position (if any) in window list
        if (i != -1) window_list.splice(i, 1);

        // if requested, add to end of window list
        if (insert) window_list.push(win);

        // adjust all zIndex values
        for (i = 0; i < window_list.length; i += 1) {
            window_list[i].style.zIndex = 100 + i;
        }
    }

    // close the window
    function window_close(win) {
        // remove the window from the DOM
        $(win).remove();

        // remove from list of pop-up windows
        bring_to_front(win, false);
    }

    function window_close_button(event) {
        window_close(event.target.win);
    }

    // capture mouse events in title bar of window
    function window_mouse_down(event) {
        var win = event.target.win;

        bring_to_front(win, true);

        // add handlers to document so we capture them no matter what
        $(document).mousemove(window_mouse_move);
        $(document).mouseup(window_mouse_up);
        document.tracking_window = win;

        // in Chrome avoid selecting everything as we drag window
        win.saved_onselectstart = document.onselectstart;
        document.onselectstart = function() {
            return false;
        };

        // remember where mouse is so we can compute dx,dy during drag
        win.drag_x = event.pageX;
        win.drag_y = event.pageY;

        return false;
    }

    function window_mouse_up(event) {
        var win = document.tracking_window;

        // show's over folks...
        $(document).unbind('mousemove');
        $(document).unbind('mouseup');
        document.tracking_window = undefined;
        win.drag_x = undefined;
        win.drag_y = undefined;

        document.onselectstart = win.saved_onselectstart;

        return false; // consume event
    }

    function window_mouse_move(event) {
        var win = document.tracking_window;

        if (win.drag_x) {
            var dx = event.pageX - win.drag_x;
            var dy = event.pageY - win.drag_y;

            // move window by dx,dy
            var offset = $(win).offset();
            offset.top += dy;
            offset.left += dx;
            $(win).offset(offset);

            // update reference point
            win.drag_x += dx;
            win.drag_y += dy;

            return false; // consume event
        }
        return false;
    }

    function window_resize_start(event) {
        var win = event.target.win;
        var lastX = event.pageX;
        var lastY = event.pageY;

        $(document).mousemove(function(event) {
            win[0].resize(event.pageX - lastX, event.pageY - lastY);
            lastX = event.pageX;
            lastY = event.pageY;
            return false;
        });

        $(document).mouseup(function(event) {
            $(document).unbind('mousemove');
            $(document).unbind('mouseup');
            return false;
        });

        return false;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Toolbar
    //
    //////////////////////////////////////////////////////////////////////

    function Toolbar(diagram) {
        this.diagram = diagram;
        this.tools = {};
        this.toolbar = $('<div class="jade-toolbar"></div>');
    }

    Toolbar.prototype.add_tool = function(tname, icon, tip, handler, enable_check) {
        var tool;
        if (icon.search('data:image') != -1) {
            tool = $('<img draggable="false"></img>');
            tool.attr('src',icon);
        }
        else tool = $('<span>'+icon+'</span>');
        tool.addClass('jade-tool jade-tool-disabled');
        tool[0].enabled = false;

        // set up event processing
        tool.mouseover(tool_enter).mouseout(tool_leave).click(tool_click);

        // add to toolbar
        tool[0].diagram = this.diagram;
        tool[0].tip = tip;
        tool[0].callback = handler;
        tool[0].enable_check = enable_check;
        this.tools[tname] = tool;
        this.toolbar.append(tool);

        return tool;
    };

    Toolbar.prototype.add_spacer = function() {
        this.toolbar.append('<div class="jade-tool-spacer"></div>');
    };

    Toolbar.prototype.enable_tools = function(diagram) {
        // loop through the tools, updating their enabled status
        for (var t in this.tools) {
            var tool = this.tools[t];
            var which = tool[0].enable_check ? tool[0].enable_check(diagram) : true;
            tool[0].enabled = which;
            tool.toggleClass('jade-tool-disabled', !which);
            tool.toggleClass('jade-tool-enabled', which);
        }
    };

    // display tip when mouse is over tool
    function tool_enter(event) {
        var tool = event.target;

        if (tool.enabled) {
            tool.diagram.message(tool.tip);
        }
    }

    // clear tip when mouse leaves
    function tool_leave(event) {
        var tool = event.target;

        if (tool.enabled) {
            tool.diagram.clear_message(tool.tip);
        }
    }

    // handle click on a tool
    function tool_click(event) {
        var tool = event.target;

        if (tool.enabled) {
            tool.diagram.event_coords(event); // so we can position pop-up window correctly
            tool.callback(tool.diagram);
        }
    }

    var close_icon = 'data:image/gif;base64,R0lGODlhEAAQAMQAAGtra/f3/62tre/v9+bm787O1pycnHNzc6WlpcXFxd7e3tbW1nt7e7W1te/v74SEhMXFzmNjY+bm5v///87OzgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAAAAAAALAAAAAAQABAAAAVt4DRMZGmSwRQQBUS9MAwRIyQ5Uq7neEFSDtxOF4T8cobIQaE4RAQ5yjHHiCCSD510QtFGvoCFdppDfBu7bYzy+D7WP5ggAgA8Y3FKwi5IAhIweW1vbBGEWy5rilsFi2tGAwSJixAFBCkpJ5ojIQA7';

    var resize_icon = 'data:image/x-icon;base64,AAABAAEAEBAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOwAAAA+AAAAAAAAAAAAAAAAAAAA7AAAAD4AAAAAAAAAAAAAAOwAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAA+AAAA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAAPgAAAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPAAAA/wAAAE8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE8AAAD/AAAATwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATwAAAP8AAABPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    //////////////////////////////////////////////////////////////////////
    //
    // Editor framework
    //
    //////////////////////////////////////////////////////////////////////

    var editors = []; // list of supported aspects

    var clipboards = {}; // clipboards for each editor type

    function Jade(owner) {
        owner.jade = this;
        owner = $(owner);
        this.parent = owner;
        this.module = undefined;

        // grab children and empty out div
        this.id = owner.attr('id');
        this.load_library(owner.text());
        owner.empty();

        var top_level = $('<div class="jade-top-level">' +
                          ' <div class="jade-tabs-div"></div>' +
                          ' <div class="jade-status"><span id="message"></span><img class="jade-resize"></img></div>' +
                          '</div>');

        // insert framework into DOM
        owner.append(top_level);

        // set up top-level toolbar
        if (owner.attr('hierarchical') !== undefined) {
            top_level.find('.jade-tabs-div').before('<div id="jade-toolbar"><button id="savelibs">Save changes</button>Module: <input id="module" type="text"></input></div>');
            this.input_field = top_level.find('#module');
            this.input_field.keypress(function(event) {
                // when user hits ENTER, edit the specified module
                if (event.keyCode == 13) owner[0].jade.edit(event.target.value);
            });

            top_level.find('#savelibs').click(function(event) {
                save_libraries();
            });
        }

        this.status = top_level.find('#message');

        // now add a display tab for each registered editor
        var tabs_div = top_level.find('.jade-tabs-div');
        var tabs = {};
        this.tabs = tabs;
        this.selected_tab = undefined;

        var elist;
        var editor_list = owner.attr('editors');  // did user supply list?
        if (editor_list !== undefined) {
            elist = [];
            $.each(editor_list.split(','),function(index,value) {
                $.each(editors,function(eindex,evalue) {
                    if (evalue.prototype.editor_name == value) elist.push(evalue);
                });
            });
        } else elist = editors;

        $.each(elist,function(i,editor) {
            var ename = editor.prototype.editor_name;
            clipboards[ename] = []; // initialize editor's clipboard

            // add tab selector
            var tab = $('<div class="jade-tab">'+ename+'</div>');
            tab[0].name = ename;
            tabs_div.append(tab);
            tab.click(function(event) {
                owner[0].jade.show(event.target.name);
                event.preventDefault();
            });

            // add body for each tab (only one will have display != none)
            var body = $('<div class="jade-tab-body"></div>');
            top_level.find('.jade-tabs-div').after(body);
            // make a new editor for this aspect
            body[0].editor = new editor(body[0], owner[0].jade);

            tabs[ename] = [tab[0], body[0]];
        });
        // select first aspect as the one to be displayed
        if (elist.length > 0) {
            this.show(elist[0].prototype.editor_name);
        }

        // add status line at the bottom
        var resize = top_level.find('.jade-resize');
        resize.attr('src',resize_icon);
        resize[0].jade = this;
        resize.mousedown(resize_mouse_down);

        this.status.text('Copyright \u00A9 MIT EECS 2011-2014');

        // should we expand to fill screen?
        if (owner.attr('fill_window')) {
            // set up handler to resize jade
            var jade = this;
            $(window).on('resize',function() {
                var win_w = $(window).width();
                var win_h = $(window).height();
                var offset = top_level.offset();
                var w = offset.left + top_level.outerWidth(true) + 10;
                var h = offset.top + top_level.outerHeight(true) + 10;
                jade.resize(win_w - w,win_h - h);
            });
            // trigger handler on startup
            $(window).trigger('resize');
        };

        // starting module?
        var mname = owner.attr('edit');
        if (mname === undefined) mname = localStorage.getItem('jade-module');
        if (mname !== undefined) {
            // mname = library:module.aspect
            mname = mname.split('.');
            this.edit(mname[0]);  // select module
            if (mname.length > 1) this.show(mname[1]);
        }
    }

    // remember module and aspect for next visit
    Jade.prototype.bookmark = function() {
        if (this.module !== undefined) {
            var mark = this.module.get_name();
            if (this.selected_tab !== undefined) mark += '.' + this.selected_tab;
            localStorage.setItem('jade-module',mark);
        }
    };

    Jade.prototype.load_library = function(json) {
        if (this.id === undefined) return;

        // create a library for this particular instance, initialize from div body
        json = $.trim(json);
        if (json.length == 0) json = '{}';

        // replace an existing library with the one we're loading!
        // prevent load from marking state as dirty
        new Library(this.id,JSON.parse(json));

        // update current module to the one in the new library!
        if (this.module)
            this.module = find_module(this.module.get_name());

        this.refresh();   // update all the editors since library changed
    };

    Jade.prototype.save_library = function() {
        if (this.id === undefined || libraries[this.id] === undefined) return '{}';
        return JSON.stringify(libraries[this.id].json());
    };

    Jade.prototype.edit = function(module) {
        if (typeof module == 'string') module = find_module(module);
        this.module = module;

        if (this.input_field !== undefined)
            this.input_field.val(module.get_name());

        this.bookmark();    // remember current module for next visit
        this.refresh();  // tell each tab which module we're editing
    };

    // if underlying library/module is reloaded, refresh each tab
    Jade.prototype.refresh = function() {
        if (this.module === undefined) return;

        // tell each tab which module we're editing
        for (var e in this.tabs) {
            this.tabs[e][1].editor.set_aspect(this.module);
        }
    };

    // make a particular tab visible -- DOM class name does the heavy lifting
    Jade.prototype.show = function(tab_name) {
        this.selected_tab = tab_name;
        this.bookmark();
        for (var tab in this.tabs) {
            var e = this.tabs[tab]; // [tab div, body div]
            var selected = (tab == tab_name);
            //e[0].className = 'jade-tab';
            $(e[0]).toggleClass('jade-tab-active', selected);
            $(e[1]).toggleClass('jade-tab-body-active', selected);
            if (selected) e[1].editor.show();
        }
    };

    Jade.prototype.resize = function(dx, dy) {
        var e = $(this.top_level);
        e.width(dx + e.width());
        e.height(dy + e.height());

        // adjust size of all the tab bodies
        for (var tab in this.tabs) {
            var ediv = this.tabs[tab][1]; // [tab div, body div]
            e = $(ediv);
            e.width(dx + e.width());
            e.height(dy + e.height());
            // inform associated editor about its new size
            ediv.editor.resize(dx, dy, tab == this.selected_tab);
        }
    };

    function resize_mouse_down(event) {
        var jade = event.target.jade;
        var lastX = event.pageX;
        var lastY = event.pageY;

        $(document).mousemove(function(event) {
            jade.resize(event.pageX - lastX, event.pageY - lastY);
            lastX = event.pageX;
            lastY = event.pageY;
            return false;
        });

        $(document).mouseup(function(event) {
            $(document).unbind('mousemove');
            $(document).unbind('mouseup');
            return false;
        });

        return false;
    }

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Signal parsing
    //
    ////////////////////////////////////////////////////////////////////////////////

    // see if two signal lists are the same
    function signal_equals(s1, s2) {
        if (s1.length == s2.length) {
            for (var i = 0; i < s1.length; i += 1) {
                if (s1[i] != s2[i]) return false;
            }
            return true;
        }
        return false;
    }

    // parse string into an array of symbols
    //  sig_list := sig[,sig]...
    //  sig := symbol
    //      := sig#count         -- replicate sig specified number of times
    //      := sig[start:stop:step]   -- expands to sig[start],sig[start+step],...,sig[end]
    function parse_signal(s) {
        function parse_sig(sig) {
            var m;

            // replicated signal: sig#number
            m = sig.match(/(.*)#\s*(\d+)$/);
            if (m) {
                var expansion = parse_sig(m[1].trim());
                var count = parseInt(m[2],10);
                if (isNaN(count)) return [sig];
                var result = [];
                while (count > 0) {
                    result.push.apply(result, expansion);
                    count -= 1;
                }
                return result;
            }

            // iterated signal: sig[start:stop:step] or sig[start:stop]
            m = sig.match(/(.*)\[\s*(\-?\d+)\s*:\s*(\-?\d+)\s*(:\s*(\-?\d+)\s*)?\]$/);
            if (m) {
                var expansion = parse_sig(m[1].trim());
                var start = parseInt(m[2],10);
                var end = parseInt(m[3],10);
                var step = Math.abs(parseInt(m[5],10) || 1);
                if (end < start) step = -step;

                var result = [];
                while (true) {
                    for (var k = 0; k < expansion.length; k += 1) {
                        result.push(expansion[k] + '[' + start.toString() + ']');
                    }
                    start += step;
                    if ((step > 0 && start > end) || (step < 0 && start < end)) break;
                }
                return result;
            }

            // what's left is treated as a simple signal name
            if (sig) return [sig];
            else return [];
        }

        // parse list of signal names
        var result = [];
        if (s !== undefined) {
            var sig_list = s.split(',');
            for (var i = 0; i < sig_list.length; i += 1) {
                var expansion = parse_sig(sig_list[i].trim());
                result.push.apply(result, expansion); // extend result with all the elements of expansion
            }
        }
        return result;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // sadly javascript has no modules, so we have to fake it
    //
    //////////////////////////////////////////////////////////////////////

    var exports = {};

    exports.Diagram = Diagram;
    exports.diagram_undo = diagram_undo;
    exports.diagram_redo = diagram_redo;
    exports.diagram_cut = diagram_cut;
    exports.diagram_copy = diagram_copy;
    exports.diagram_paste = diagram_paste;
    exports.diagram_fliph = diagram_fliph;
    exports.diagram_flipv = diagram_flipv;
    exports.diagram_rotcw = diagram_rotcw;
    exports.diagram_rotccw = diagram_rotccw;

    exports.Aspect = Aspect;
    exports.Component = Component;
    exports.make_component = make_component;
    exports.ConnectionPoint = ConnectionPoint;
    exports.connection_point_radius = connection_point_radius;

    exports.Toolbar = Toolbar;
    exports.Jade = Jade;

    exports.editors = editors;
    exports.clipboards = clipboards;
    exports.built_in_components = built_in_components;

    exports.libraries = libraries;
    exports.find_module = find_module;
    exports.build_table = build_table;
    exports.build_button = build_button;
    exports.build_input = build_input;
    exports.build_select = build_select;
    exports.dialog = dialog;
    exports.window = jade_window;
    exports.window_close = window_close;
    exports.canonicalize = canonicalize;
    exports.aOrient = aOrient;

    return exports;
}());

$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});

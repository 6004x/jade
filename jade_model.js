// JADE: JAvascript Design Environment

// Model:
//  libraries: object with Library attributes
//  Library: object with Module attributes
//  Module: [ object with Aspect attributes, object with Propery attributes ]
//  Property: object with the following attributes: type, label, value, edit, choices
//  Aspect: list of Components, support for ConnectionPoints, undo/reo
//  Component: list of [type coords { property: value... }]
//  coords: list of position/dimension params (x, y, rotation)...

jade.model = (function () {

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
        this.read_only = false;

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

    Library.prototype.clear_modified = function() {
        // this will clear the library's modified flag when
        // all modules are unmodified
        for (m in this.modules) this.modules[m].clear_modified();
    };

    Library.prototype.set_modified = function(which) {
        if (which != this.modified) {
            this.modified = which;
            if (which) {
                $('body').attr('data-dirty','yes');
                $('#savelibs').prop('disabled',false);
            } else {
                // if all libraries are now unmodified, clear data-dirty attr
                var dirty = false;
                $.each(libraries,function (lname,lib) { if (lib.modified) dirty = true; });
                if (!dirty) {
                    $('body').removeAttr('data-dirty');
                    $('#savelibs').prop('disabled',true);
                }
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
        if (!this.read_only && this.modified) {
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
                    lib.clear_modified();
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

    function load_library(lname,read_only) {
        var args = {
            async: false, // hang until load completes
            url: lname,
            type: 'GET',
            dataType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                alert('Error while loading library '+lname+': '+errorThrown);
            },
            success: function(json) {
                // allocate new library, add to list so we know we're loading it
                var lib = new Library(lname);
                lib.load(json);
                if (read_only) lib.read_only = true;
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

    Module.prototype.clear_modified = function() {
        // this will clear the module's modified flag when
        // all aspects are unmodified
        for (a in this.aspects) this.aspects[a].set_modified(false);
    };

    Module.prototype.set_modified = function(which) {
        if (this.modified != which) {
            this.modified = which;
            if (which) this.library.set_modified(true);
            else this.library.check_modified();
        }
    };

    // if all aspects are clean, module is too
    Module.prototype.check_modified = function() {
        var dirty = false;
        $.each(this.aspects,function (aname,aspect) { if (aspect.modified) dirty = true; });
        if (!dirty) this.set_modified(false);
    };

    Module.prototype.set_property = function(prop, v) {
        if (v != this.properties[prop]) {
            this.properties[prop] = v;
            this.set_modified(true);
        }
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

        this.set_modified(this.current_action != -1);
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
            if (v !== undefined && v !== '' && this.module.properties[p] &&
                (!remove_default_values || v != this.module.properties[p].value)) props[p] = v;
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
        diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] ||  (diagram.show_grid ? diagram.component_style : diagram.normal_style));
        var nx1 = this.transform_x(x1, y1) + this.coords[0];
        var ny1 = this.transform_y(x1, y1) + this.coords[1];
        var nx2 = this.transform_x(x2, y2) + this.coords[0];
        var ny2 = this.transform_y(x2, y2) + this.coords[1];
        diagram.draw_line(nx1, ny1, nx2, ny2, width || 1);
    };

    Component.prototype.draw_circle = function(diagram, x, y, radius, filled) {
        if (filled) diagram.c.fillStyle = this.selected ? diagram.selected_style : diagram.normal_style;
        else diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] ||  (diagram.show_grid ? diagram.component_style : diagram.normal_style));
        var nx = this.transform_x(x, y) + this.coords[0];
        var ny = this.transform_y(x, y) + this.coords[1];

        diagram.draw_arc(nx, ny, radius, 0, 2 * Math.PI, false, 1, filled);
    };

    // draw arc from [x1,y1] to [x2,y2] passing through [x3,y3]
    Component.prototype.draw_arc = function(diagram, x1, y1, x2, y2, x3, y3) {
        diagram.c.strokeStyle = this.selected ? diagram.selected_style : this.type == 'wire' ? diagram.normal_style : (colors_rgb[this.properties.color] ||  (diagram.show_grid ? diagram.component_style : diagram.normal_style));

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
        if (fill === undefined) diagram.c.fillStyle = this.selected ? diagram.selected_style : (colors_rgb[this.properties.color] || (diagram.show_grid ? diagram.component_style : diagram.normal_style));
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
            nlist = jade.utils.parse_signal(this.properties.global_signal);
        else {
            nlist = jade.utils.parse_signal(this.properties.signal);
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
                if (mprop.type == 'menu') input = jade.build_select(mprop.choices, this.properties[p]);
                else {
                    var v = this.properties[p];
                    input = jade.build_input('text', Math.max(10, (v === undefined ? 1 : v.length) + 5), this.properties[p]);
                }
                input.prop_name = p;
                fields[lbl] = input;
            }

            var content = jade.build_table(fields);
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
        this.nlist = jade.utils.parse_signal(name);
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
        else if (!jade.utils.signal_equals(this.label, label))
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

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        libraries: libraries,
        find_module: find_module,
        load_library: load_library,
        Aspect: Aspect,
        Component: Component,
        make_component: make_component,
        built_in_components: built_in_components,
        canonicalize: canonicalize,
        aOrient: aOrient,
        ConnectionPoint: ConnectionPoint,
        connection_point_radius: connection_point_radius
    };
}());

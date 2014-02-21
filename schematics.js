// Copyright (C) 2011-2014 Massachusetts Institute of Technology
// Chris Terman

// keep jslint happy
//var console,JSON;
//var $,jade,cktsim,plot;

var schematics = (function() {
    //////////////////////////////////////////////////////////////////////
    //
    // Schematic editor
    //
    //////////////////////////////////////////////////////////////////////

    var schematic_tools = [];

    function Schematic(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.components = parent.parent.attr('components');

        this.diagram = new jade.Diagram(this, 'jade-schematic-diagram');
        div.diagram = this.diagram;
        this.diagram.wire = undefined;
        this.diagram.new_part = undefined;

        this.diagram.grid = 8;
        this.diagram.zoom_factor = 1.25; // scaling is some power of zoom_factor
        this.diagram.zoom_min = Math.pow(this.diagram.zoom_factor, - 3);
        this.diagram.zoom_max = Math.pow(this.diagram.zoom_factor, 5);
        this.diagram.origin_min = -200; // in grids
        this.diagram.origin_max = 200;

        this.hierarchy_stack = []; // remember path when traveling up/down hierarchy

        // register event handlers
        $(this.diagram.canvas).mousemove(schematic_mouse_move).mouseover(schematic_mouse_enter).mouseout(schematic_mouse_leave).mouseup(schematic_mouse_up).mousedown(schematic_mouse_down).dblclick(schematic_double_click).keydown(schematic_key_down);

        this.toolbar = new jade.Toolbar(this.diagram);
        this.toolbar.add_tool('undo', undo_icon, 'Undo: undo effect of previous action', jade.diagram_undo,
                              function(diagram) {
                                  return diagram.aspect.can_undo();
                              });
        this.toolbar.add_tool('redo', redo_icon, 'redo: redo effect of next action', jade.diagram_redo,
                              function(diagram) {
                                  return diagram.aspect.can_redo();
                              });

        function has_selections(diagram) {
            return diagram.aspect.selections();
        }
        
        this.toolbar.add_tool('cut', cut_icon, 'Cut: move selected components from diagram to the clipboard', jade.diagram_cut, has_selections);
        this.toolbar.add_tool('copy', copy_icon, 'Copy: copy selected components into the clipboard', jade.diagram_copy, has_selections);
        this.toolbar.add_tool('paste', paste_icon, 'Paste: copy clipboard into the diagram', jade.diagram_paste,
                              function(diagram) {
                                  return jade.clipboards[diagram.editor.editor_name].length > 0;
                              });
        this.toolbar.add_tool('fliph', fliph_icon, 'Flip Horizontally: flip selection horizontally', jade.diagram_fliph, has_selections);
        this.toolbar.add_tool('flipv', flipv_icon, 'Flip Vertically: flip selection vertically', jade.diagram_flipv, has_selections);
        this.toolbar.add_tool('rotcw', rotcw_icon, 'Rotate Clockwise: rotate selection clockwise', jade.diagram_rotcw, has_selections);
        this.toolbar.add_tool('rotccw', rotccw_icon, 'Rotate Counterclockwise: rotate selection counterclockwise', jade.diagram_rotccw, has_selections);
        this.toolbar.add_spacer();

        // are we supporting hierarchy?
        this.hierarchy = (parent.input_field !== undefined);
        if (this.hierarchy) {
            this.toolbar.add_tool('down', down_icon, 'Down in the hierarchy: view selected included module', schematic_down,
                                  function(diagram) {
                                      var selected = diagram.aspect.selected_component();
                                      if (selected !== undefined) return selected.has_aspect(Schematic.prototype.editor_name);
                                      else return false;
                                  });
            this.toolbar.add_tool('up', up_icon, 'Up in the hierarchy: return to including module', schematic_up,
                                  function(diagram) {
                                      return diagram.editor.hierarchy_stack.length > 0;
                                  });
            this.toolbar.add_spacer();
        }

        var part = this.toolbar.add_tool('ground', ground_icon, 'Ground connection: click and drag to insert', null, function() { return true; });
        part_tool(part,div.diagram,'ground');

        part = this.toolbar.add_tool('vdd', vdd_icon, 'Power supply connection: click and drag to insert', null, function() { return true; });
        part_tool(part,div.diagram,'vdd');

        part = this.toolbar.add_tool('port', port_icon, 'I/O Port: click and drag to insert', null, function() { return true; });
        part_tool(part,div.diagram,'port');

        this.toolbar.add_spacer();

        // add external tools
        var tools = parent.parent.attr('tools');
        if (tools !== undefined) tools = tools.split(',');
        for (var i = 0; i < schematic_tools.length; i += 1) {
            var info = schematic_tools[i]; // [name,icon,tip,callback,enable_check]
            if (tools !== undefined && $.inArray(info[0],tools) == -1)
                continue;  // skip tool if it's not on the list
            this.toolbar.add_tool(info[0], info[1], info[2], info[3], info[4]);
        }

        div.appendChild(this.toolbar.toolbar[0]);

        div.appendChild(this.diagram.canvas);
        this.aspect = new jade.Aspect('untitled', null);
        this.diagram.set_aspect(this.aspect);

        // set up parts bin
        this.parts_bin = new PartsBin(this);
        div.appendChild(this.parts_bin.top_level);

    }

    function part_tool(tool,diagram,pname) {
        tool.off('click');   // different gesture for this tool
        var part = new Part(diagram);
        part.set_component(jade.make_component([pname,[0,0,0],{}]));
        tool.mousedown(function(event) { diagram.new_part = part; });
        tool.mouseup(function(event) { diagram.new_part = undefined; });
    }

    Schematic.prototype.resize = function(dx, dy, selected) {
        // schematic canvas
        var e = $(this.diagram.canvas);
        e.width(dx + e.width());
        e.height(dy + e.height());

        this.parts_bin.resize(dx, dy, selected);

        // adjust diagram to reflect new size
        if (selected) this.diagram.resize();
    };

    Schematic.prototype.show = function() {
        this.diagram.resize();
        this.parts_bin.show();
    };

    Schematic.prototype.set_aspect = function(module) {
        this.diagram.set_aspect(module.aspect(Schematic.prototype.editor_name));
        this.parts_bin.show();
    };

    Schematic.prototype.redraw = function(diagram) {
        // draw new wire
        var r = diagram.wire;
        if (r) {
            diagram.c.strokeStyle = diagram.selected_style;
            diagram.draw_line(r[0], r[1], r[2], r[3], 1);
        }
    };

    function schematic_down(diagram) {
        var selected = diagram.aspect.selected_component();
        if (selected !== undefined && selected.has_aspect(Schematic.prototype.editor_name)) {
            var e = diagram.editor;
            e.hierarchy_stack.push(diagram.aspect.module); // remember what we were editing
            e.jade.edit(selected.module);
        }
    }

    function schematic_up(diagram) {
        var e = diagram.editor;
        if (e.hierarchy_stack.length > 0)
            // return to previous module
            e.jade.edit(e.hierarchy_stack.pop());
    }

    Schematic.prototype.editor_name = 'schematic';
    jade.editors.push(Schematic);

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Event handling
    //
    ////////////////////////////////////////////////////////////////////////////////

    // process keystrokes, consuming those that are meaningful to us
    function schematic_key_down(event) {
        var diagram = event.target.diagram;
        var code = event.keyCode;

        if (code == 38) schematic_up(diagram); // up arrow
        else if (code == 40) schematic_down(diagram); // down arrow
        else diagram.key_down(event);

        event.preventDefault();
        return false;
    }

    function schematic_mouse_enter(event) {
        var diagram = event.target.diagram;

        // see if user has selected a new part
        if (diagram.new_part) {
            // grab incoming part, turn off selection of parts bin
            var part = diagram.new_part;
            diagram.new_part = undefined;
            part.select(false);

            // unselect everything else in the diagram, add part and select it
            diagram.unselect_all(-1);
            diagram.redraw_background(); // so we see any components that got unselected

            // start of a new action
            diagram.aspect.start_action();

            // make a clone of the component in the parts bin
            diagram.set_cursor_grid(part.component.required_grid);
            part = part.component.clone(diagram.cursor_x, diagram.cursor_y);
            part.add(diagram.aspect); // add it to aspect
            part.set_select(true);

            // and start dragging it
            diagram.drag_begin();
        }

        diagram.redraw();
        diagram.canvas.focus(); // capture key strokes
        return false;
    }

    function schematic_mouse_leave(event) {
        var diagram = event.target.diagram;

        diagram.redraw();
        return false;
    }

    function schematic_mouse_down(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        // see if user is trying to pan or zoom
        if (diagram.pan_zoom()) return false;

        // is mouse over a connection point?  If so, start dragging a wire
        var dx = Math.abs(diagram.aspect_x - diagram.cursor_x);
        var dy = Math.abs(diagram.aspect_y - diagram.cursor_y);
        var cplist = diagram.aspect.connection_points[diagram.cursor_x + ',' + diagram.cursor_y];
        if (dx <= jade.connection_point_radius && dy <= jade.connection_point_radius && cplist && !event.shiftKey) {
            diagram.unselect_all(-1);
            diagram.redraw_background();
            diagram.wire = [diagram.cursor_x, diagram.cursor_y, diagram.cursor_x, diagram.cursor_y];
        }
        else diagram.start_select(event.shiftKey);

        event.preventDefault();
        return false;
    }

    function schematic_mouse_move(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        if (diagram.wire) {
            // update new wire end point
            diagram.wire[2] = diagram.cursor_x;
            diagram.wire[3] = diagram.cursor_y;
            diagram.redraw();
        }
        else diagram.mouse_move();

        event.preventDefault();
        return false;
    }

    function schematic_mouse_up(event) {
        var diagram = event.target.diagram;

        // drawing a new wire
        if (diagram.wire) {
            var r = diagram.wire;
            diagram.wire = undefined;

            if (r[0] != r[2] || r[1] != r[3]) {
                // insert wire component
                diagram.aspect.start_action();
                var wire = diagram.aspect.add_wire(r[0], r[1], r[2], r[3], 0);
                wire.selected = true;
                diagram.aspect.end_action();
                diagram.redraw_background();
            }
            else diagram.redraw();
        }
        else diagram.mouse_up(event.shiftKey);

        event.preventDefault();
        return false;
    }

    function schematic_double_click(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        // see if we double-clicked a component.  If so, edit it's properties
        diagram.aspect.map_over_components(function(c) {
            if (c.edit_properties(diagram, diagram.aspect_x, diagram.aspect_y)) return true;
            return false;
        });

        event.preventDefault();
        return false;
    }

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Built-in schematic components
    //
    ////////////////////////////////////////////////////////////////////////////////

    function Wire(json) {
        jade.Component.call(this);
        this.module = wire_module; // set up properties for this component
        this.load(json);
    }
    Wire.prototype = new jade.Component();
    Wire.prototype.constructor = Wire;
    jade.built_in_components.wire = Wire;
    var wire_module = {
        has_aspect: function () {return false;},
        properties: {
            "signal": {
                "type": "string",
                "label": "Signal name",
                "value": "",
                "edit": "yes"
            }
        }
    };

    var wire_distance = 2; // how close to wire counts as "near by"

    Wire.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        var dx = this.coords[3];
        var dy = this.coords[4];
        this.add_connection(0, 0);
        this.add_connection(dx, dy);

        // compute bounding box (expanded slightly)
        var r = [0, 0, dx, dy];
        jade.canonicalize(r);
        r[0] -= wire_distance;
        r[1] -= wire_distance;
        r[2] += wire_distance;
        r[3] += wire_distance;
        this.bounding_box = r;
        this.update_coords(); // update bbox

        // used in selection calculations
        this.len = Math.sqrt(dx * dx + dy * dy);
    };

    // return connection point at other end of wire from specified cp
    Wire.prototype.other_end = function(cp) {
        if (this.connections[0].coincident(cp.x, cp.y)) return this.connections[1];
        else if (this.connections[1].coincident(cp.x, cp.y)) return this.connections[0];
        return undefined;
    };

    Wire.prototype.far_end = function() {
        // one end of the wire is at x,y
        // return coords at the other end
        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0];
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];
        return [x2, y2];
    };

    Wire.prototype.move_end = function() {
        jade.Component.prototype.move_end.call(this);

        // look for connection points that might bisect us
        this.aspect.check_connection_points(this);
    };

    Wire.prototype.add = function(aspect) {
        jade.Component.prototype.add.call(this, aspect);

        // look for wires bisected by this wire
        this.aspect.check_wires(this);

        // look for connection points that might bisect this wire
        this.aspect.check_connection_points(this);
    };

    Wire.prototype.remove = function() {
        // removing wires is a bit tricky since bisection and reassembly
        // due to other edits will have replaced the original wire.  So
        // look for a wire between the same two end points and remove that.
        var cp1 = this.connections[0];
        var cp2 = this.connections[1];
        var cplist = this.aspect.find_connections(cp1);
        for (var i = 0; i < cplist.length; i += 1) {
            var w = cplist[i].parent;
            if (w.type == 'wire' && w.other_end(cp1).coincident(cp2.x, cp2.y)) {
                jade.Component.prototype.remove.call(w);
                break;
            }
        }
    };

    Wire.prototype.draw = function(diagram) {
        var dx = this.coords[3];
        var dy = this.coords[4];

        this.draw_line(diagram, 0, 0, dx, dy);

        // display signal name if there is one
        var name = this.properties.signal;
        var align;
        if (name !== undefined) {
            // if wire has one unconnected end, but label there
            var ncp0 = this.connections[0].nconnections() == 1;
            var ncp1 = this.connections[1].nconnections() == 1;
            if ((ncp0 && !ncp1) || (!ncp0 && ncp1)) {
                // this is the unconnected end
                var cp = this.connections[ncp0 ? 0 : 1];
                var x = cp.offset_x;
                var y = cp.offset_y;
                if (dx === 0 || Math.abs(dy / dx) > 1) {
                    // vertical-ish wire
                    var cy = (this.bounding_box[1] + this.bounding_box[3]) / 2;
                    if (cp.offset_y > cy) {
                        align = 1;
                        y += 3;
                    } // label at bottom end
                    else {
                        align = 7;
                        y -= 3;
                    } // label at top end
                }
                else {
                    // horiztonal-ish wire
                    var cx = (this.bounding_box[0] + this.bounding_box[2]) / 2;
                    if (cp.offset_x > cx) {
                        align = 3;
                        x += 3;
                    } // label at right end
                    else {
                        align = 5;
                        x -= 3;
                    } // label at left end
                }
                this.draw_text(diagram, name, x, y, align, diagram.property_font);
            }
            else {
                // draw label at center of wire
                if (dx === 0) align = 3;
                else if (dy === 0) align = 7;
                else if (dy / dx > 0) align = 6;
                else align = 8;
                this.draw_text(diagram, name, dx >> 1, dy >> 1, align, diagram.property_font);
            }
        }
    };

    Wire.prototype.draw_icon = function(c, diagram) {
        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0];
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];

        c.draw_line(diagram, this.coords[0], this.coords[1], x2, y2);
    };

    // compute distance between x,y and nearest point on line
    // http://www.allegro.cc/forums/thread/589720
    Wire.prototype.distance = function(x, y) {
        var dx = this.transform_x(this.coords[3], this.coords[4]); // account for rotation
        var dy = this.transform_y(this.coords[3], this.coords[4]);
        var D = Math.abs((x - this.coords[0]) * dy - (y - this.coords[1]) * dx) / this.len;
        return D;
    };

    // does mouse click fall on this component?
    Wire.prototype.near = function(x, y) {
        // crude check: (x,y) within expanded bounding box of wire
        // final check: distance to nearest point on line is small
        if (this.inside(x, y) && this.distance(x, y) <= wire_distance) return true;
        return false;
    };

    Wire.prototype.select_rect = function(s) {
        this.was_previously_selected = this.selected;

        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0]; // account for rotation
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];
        if (this.inside(this.coords[0], this.coords[1], s) || this.inside(x2, y2, s)) this.set_select(true);
    };

    // if connection point cp bisects the
    // wire represented by this compononent, return true
    Wire.prototype.bisect_cp = function(cp) {
        var x = cp.x;
        var y = cp.y;

        // crude check: (x,y) within expanded bounding box of wire
        // final check: ensure point isn't an end point of the wire
        if (this.inside(x, y) && this.distance(x, y) < 1 && !this.connections[0].coincident(x, y) && !this.connections[1].coincident(x, y)) return true;
        return false;
    };

    // if some connection point of component c bisects the
    // wire represented by this compononent, return that
    // connection point.  Otherwise return null.
    Wire.prototype.bisect = function(c) {
        if (c === undefined) return null;
        for (var i = c.connections.length - 1; i >= 0; i -= 1) {
            var cp = c.connections[i];
            if (this.bisect_cp(cp)) return cp;
        }
        return null;
    };

    Wire.prototype.propagate_label = function(label) {
        // wires "conduct" their label to the other end
        // don't worry about relabeling a cp, it won't recurse!
        this.connections[0].propagate_label(label);
        this.connections[1].propagate_label(label);
    };

    Wire.prototype.label_connections = function(prefix) {
        // wires don't participate in this
    };

    Wire.prototype.netlist = function(prefix) {
        // no netlist entry for wires
        return undefined;
    };

    // Ground

    function Ground(json) {
        jade.Component.call(this);
        this.module = ground_module; // set up properties for this component
        this.load(json);
    }
    Ground.prototype = new jade.Component();
    Ground.prototype.constructor = Ground;
    jade.built_in_components.ground = Ground;
    var ground_module = {
        has_aspect: function () {return false;},
        properties: {"global_signal":{"label":"Global signal name","type":"string","value":"gnd","edit":"no","choices":[""]}}
    };

    Ground.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = {};
        this.default_properties(); // add any missing properties
        this.add_connection(0, 0);

        // compute bounding box (expanded slightly)
        var r = [-6, 0, 6, 14];
        this.bounding_box = r;
        this.update_coords(); // update bbox
    };

    Ground.prototype.draw = function(diagram) {
        this.draw_line(diagram,0,0,0,8);
        this.draw_line(diagram,-6,8,6,8);
        this.draw_line(diagram,-6,8,0,14);
        this.draw_line(diagram,6,8,0,14);
    };

    Ground.prototype.netlist = function(prefix) {
        return [["ground",{"gnd":"gnd"},{}]];
    };

    // Vdd

    function Vdd(json) {
        jade.Component.call(this);
        this.module = vdd_module; // set up properties for this component
        this.load(json);
    }
    Vdd.prototype = new jade.Component();
    Vdd.prototype.constructor = Vdd;
    jade.built_in_components.vdd = Vdd;
    var vdd_module = {
        has_aspect: function () {return false;},
        properties: {"global_signal":{"label":"Global signal name","type":"string","value":"Vdd","edit":"yes","choices":[""]}}
    };

    Vdd.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};
        this.default_properties(); // add any missing properties
        this.add_connection(0, 0);

        // compute bounding box (expanded slightly)
        var r = [-6, -8, 6, 0];
        this.bounding_box = r;
        this.update_coords(); // update bbox
    };

    Vdd.prototype.draw = function(diagram) {
        this.draw_line(diagram,0,0,0,-8);
        this.draw_line(diagram,-6,-8,6,-8);
        this.draw_text(diagram,this.properties.global_signal,0,-10,7,diagram.property_font);
    };

    Vdd.prototype.netlist = function(prefix) {
        return undefined;
    };

    // I/O port

    function Port(json) {
        jade.Component.call(this);
        this.module = port_module; // set up properties for this component
        this.load(json);
    }
    Port.prototype = new jade.Component();
    Port.prototype.constructor = Port;
    jade.built_in_components.port = Port;
    var port_module = {
        has_aspect: function () {return false;},
        properties: {"signal":{"label":"Signal name","type":"string","value":"???","edit":"yes","choices":[""]}}
    };

    Port.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};
        this.default_properties(); // add any missing properties
        this.add_connection(0, 0);

        // compute bounding box (expanded slightly)
        var r = [-24, -4, 0, 4];
        this.bounding_box = r;
        this.update_coords(); // update bbox
    };

    Port.prototype.draw = function(diagram) {
        this.draw_line(diagram,0,0,-8,0);
        this.draw_line(diagram,-8,0,-12,-4);
        this.draw_line(diagram,-12,-4,-24,-4);
        this.draw_line(diagram,-8,0,-12,4);
        this.draw_line(diagram,-12,4,-24,4);
        this.draw_line(diagram,-24,-4,-24,4);
        this.draw_text(diagram,this.properties.signal,-26,0,5,diagram.property_font);
    };

    Port.prototype.netlist = function(prefix) {
        return undefined;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Parts bin
    //
    ////////////////////////////////////////////////////////////////////////////////

    var part_w = 42; // size of a parts bin compartment
    var part_h = 42;

    function PartsBin(editor) {
        this.diagram = editor.diagram;
        this.components = editor.components;

        this.top_level = document.createElement('div');
        this.top_level.className = 'jade-parts-bin';
        this.top_level.parts_bin = this;

        if (this.components === undefined) {
            this.lib_select = document.createElement('select');
            this.lib_select.className = 'jade-parts-select';
            //this.lib_select.style.width = '120px';
            this.top_level.appendChild(this.lib_select);

            var parts_bin = this; // for closure
            $(this.lib_select).change(function() {
                parts_bin.update_modules();
            });
        }

        this.parts = {}; // lib:module => Part
        this.parts_list = document.createElement('div');
        this.parts_list.className = 'jade-parts-list';
        this.top_level.appendChild(this.parts_list);


    }

    PartsBin.prototype.resize = function(dx, dy, selected) {
        var e = $(this.parts_list);
        e.height(dy + e.height());
    };

    PartsBin.prototype.show = function() {
        if (this.lib_select !== undefined) {
            // remove existing list of libraries from select
            var options = this.lib_select.options;
            for (var i = options.length - 1; i >= 0; i -= 1) {
                options.remove(i);
            }


            // add existing libraries as options for select
            var libs = Object.keys(jade.libraries);
            libs.sort();
            jade.build_select(libs, libs[0], this.lib_select);
        }

        this.update_modules();
    };

    // update list of modules for selected library
    PartsBin.prototype.update_modules = function() {
        // remove old parts from parts list
        $(this.parts_list).empty();

        if (this.components !== undefined) {
            // create a part for each module/library on list
            var partsbin = this;  // for closure
            $.each(this.components.split(','),function(index,component) {
                jade.find_module(component);  // make sure it's loaded
                partsbin.add_part(component);
            });
        } else {
            // create a part for each module in select library, add to parts list
            var lname = this.lib_select.value;
            if (lname) {
                var mlist = Object.keys(jade.libraries[lname].modules);
                mlist.sort();
                for (var i = 0; i < mlist.length; i += 1) {
                    this.add_part(lname + ':' + mlist[i]);
                }
            }
        }
    };

    PartsBin.prototype.add_part = function(mname) {
        // check cache, create Part if new module
        var part = this.parts[mname];
        if (part === undefined) {
            part = new Part(this.diagram);
            this.parts[mname] = part;
            part.set_component(jade.make_component([mname, [0, 0, 0]]));
        }

        this.parts_list.appendChild(part.canvas[0]);

        // incorporate any recent edits to the icon
        part.component.compute_bbox();
        part.rescale();
        part.redraw();

        // add handlers here since any old handlers were
        // removed if part was removed from parts_list
        // at some earlier point
        $(part.canvas).mouseover(part_enter).mouseout(part_leave).mousedown(part_mouse_down).mouseup(part_mouse_up);
    };

    // one instance will be created for each part in the parts bin
    function Part(diagram) {
        this.diagram = diagram;
        this.aspect = undefined;
        this.selected = false;

        // set up canvas
        this.canvas = $('<canvas class="jade-part jade-tool jade-tool-enabled"></div>').css('cursor','default');
        this.canvas[0].part = this;

        // handle retina devices properly
        var context = this.canvas[0].getContext('2d');
        var devicePixelRatio = window.devicePixelRatio || 1;
        var backingStoreRatio = context.webkitBackingStorePixelRatio ||
                context.mozBackingStorePixelRatio ||
                context.msBackingStorePixelRatio ||
                context.oBackingStorePixelRatio ||
                context.backingStorePixelRatio || 1;
        this.pixelRatio = devicePixelRatio / backingStoreRatio;

        this.canvas[0].width = part_w * this.pixelRatio;
        this.canvas[0].height = part_h * this.pixelRatio;

        // set up appropriately scaled context
        context.scale(this.pixelRatio,this.pixelRatio);

        this.property_font = '5pt sans-serif'; // point size for Component property text
        this.annotation_font = '6pt sans-serif'; // point size for diagram annotations
    }

    Part.prototype.rescale = function() {
        // figure out scaling and centering of parts icon
        var b = this.component.bounding_box;
        if (b[0] == Infinity) b = [-1, - 1, 1, 1]; // deal with empty icons

        var dx = b[2] - b[0];
        var dy = b[3] - b[1];
        this.scale = Math.min(part_w/(1.1 * Math.abs(dx)),
                              part_h/(1.1 * Math.abs(dy)), 0.8);
        this.origin_x = b[0] + dx/2.0 - part_w/(2.0 * this.scale);
        this.origin_y = b[1] + dy/2.0 - part_h/(2.0 * this.scale);
    };

    Part.prototype.set_component = function(component) {
        this.component = component;
    };

    Part.prototype.redraw = function() {
        var c = this.canvas[0].getContext('2d');
        this.c = c;

        // paint background color
        c.clearRect(0, 0, this.canvas[0].width, this.canvas[0].height);

        if (this.component) this.component.draw(this);
    };

    Part.prototype.select = function(which) {
        this.selected = which;
        this.redraw();
    };

    Part.prototype.update_connection_point = function(cp, old_location) {
        // no connection points in the parts bin
    };

    Part.prototype.moveTo = function(x, y) {
        var xx = Math.floor((x - this.origin_x) * this.scale) + 0.5;
        var yy = Math.floor((y - this.origin_y) * this.scale) + 0.5;
        this.c.moveTo(xx,yy);
    };

    Part.prototype.lineTo = function(x, y) {
        var xx = Math.floor((x - this.origin_x) * this.scale) + 0.5;
        var yy = Math.floor((y - this.origin_y) * this.scale) + 0.5;
        this.c.lineTo(xx,yy);
    };

    Part.prototype.line_width = function(width) {
        // integer line widths help us avoid the horrors of antialiasing on H and V lines
        return Math.max(1,Math.floor(width * this.scale));
    };

    Part.prototype.draw_line = function(x1, y1, x2, y2, width) {
        var c = this.c;
        c.lineWidth = this.line_width(width);
        c.beginPath();
        this.moveTo(x1,y1);
        this.lineTo(x2,y2);
        //c.moveTo((x1 - this.origin_x) * this.scale, (y1 - this.origin_y) * this.scale);
        //c.lineTo((x2 - this.origin_x) * this.scale, (y2 - this.origin_y) * this.scale);
        c.stroke();
    };

    Part.prototype.draw_arc = function(x, y, radius, start_radians, end_radians, anticlockwise, width, filled) {
        var c = this.c;
        c.lineWidth = this.line_width(width);
        c.beginPath();
        var xx = Math.floor((x - this.origin_x) * this.scale) + 0.5;
        var yy = Math.floor((y - this.origin_y) * this.scale) + 0.5;
        c.arc(xx, yy, Math.max(1, radius * this.scale),
              start_radians, end_radians, anticlockwise);
        if (filled) c.fill();
        else c.stroke();
    };

    Part.prototype.draw_text = function(text, x, y, size) {
        // most text not displayed for the parts icon
    };

    Part.prototype.draw_text_important = function(text, x, y, font) {
        var c = this.c;

        // scale font size appropriately
        var s = font.match(/\d+/)[0];
        s = Math.max(2, Math.round(s * this.scale));
        c.font = font.replace(/\d+/, s.toString());

        c.fillStyle = 'rgb(0,0,0)';
        var xx = Math.floor((x - this.origin_x) * this.scale) + 0.5;
        var yy = Math.floor((y - this.origin_y) * this.scale) + 0.5;
        c.fillText(text, xx, yy);
    };

    function part_enter(event) {
        var part = event.target.part;

        var tip = part.component.module.properties.tool_tip;
        if (tip !== undefined) tip = tip.value;
        else tip = part.component.type;
        tip += ': drag onto diagram to insert';

        part.diagram.message(tip);
        return false;
    }

    function part_leave(event) {
        var part = event.target.part;

        part.diagram.message('');
        return false;
    }

    function part_mouse_down(event) {
        var part = event.target.part;

        part.select(true);
        part.diagram.new_part = part;
        return false;
    }

    function part_mouse_up(event) {
        var part = event.target.part;

        part.select(false);
        part.diagram.new_part = undefined;
        return false;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Icon aspect
    //
    //////////////////////////////////////////////////////////////////////

    var icon_tools = [];

    function Icon(div, parent) {
        this.jade = parent;
        this.status = parent.status;

        this.diagram = new jade.Diagram(this, 'jade-icon-diagram');
        div.diagram = this.diagram;

        this.diagram.grid = 8;
        this.diagram.zoom_factor = 1.25; // scaling is some power of zoom_factor
        this.diagram.zoom_min = Math.pow(this.diagram.zoom_factor, 1);
        this.diagram.zoom_max = Math.pow(this.diagram.zoom_factor, 10);
        this.diagram.origin_min = -64; // in grids
        this.diagram.origin_max = 64;

        // register event handlers
        $(this.diagram.canvas).mouseover(icon_mouse_enter).mouseout(icon_mouse_leave).mousemove(icon_mouse_move).mousedown(icon_mouse_down).mouseup(icon_mouse_up).dblclick(icon_double_click).keydown(icon_key_down);

        this.toolbar = new jade.Toolbar(this.diagram);
        this.toolbar.add_tool('undo', undo_icon, 'Undo: undo effect of previous action', jade.diagram_undo,
                              function(diagram) {
                                  return diagram.aspect.can_undo();
                              });
        this.toolbar.add_tool('redo', redo_icon, 'redo: redo effect of next action', jade.diagram_redo,
                              function(diagram) {
                                  return diagram.aspect.can_redo();
                              });

        function has_selections(diagram) {
            return diagram.aspect.selections();
        }
        
        this.toolbar.add_tool('cut', cut_icon, 'Cut: move selected components from diagram to the clipboard', jade.diagram_cut, has_selections);
        this.toolbar.add_tool('copy', copy_icon, 'Copy: copy selected components into the clipboard', jade.diagram_copy, has_selections);
        this.toolbar.add_tool('paste', paste_icon, 'Paste: copy clipboard into the diagram', jade.diagram_paste,
                              function(diagram) {
                                  return jade.clipboards[diagram.editor.editor_name].length > 0;
                              });
        this.toolbar.add_tool('fliph', fliph_icon, 'Flip Horizontally: flip selection horizontally', jade.diagram_fliph, has_selections);
        this.toolbar.add_tool('flipv', flipv_icon, 'Flip Vertically: flip selection vertically', jade.diagram_flipv, has_selections);
        this.toolbar.add_tool('rotcw', rotcw_icon, 'Rotate Clockwise: rotate selection clockwise', jade.diagram_rotcw, has_selections);
        this.toolbar.add_tool('rotccw', rotccw_icon, 'Rotate Counterclockwise: rotate selection counterclockwise', jade.diagram_rotccw, has_selections);

        this.toolbar.add_spacer();

        // add tools for creating icon components
        this.modes = {};
        this.modes.select = this.toolbar.add_tool('select', select_icon, 'Select mode', icon_select);
        this.set_mode('select');
        this.modes.line = this.toolbar.add_tool('line', line_icon, 'Icon line mode', icon_line);
        this.modes.arc = this.toolbar.add_tool('arc', arc_icon, 'Icon arc mode', icon_arc);
        this.modes.circle = this.toolbar.add_tool('circle', circle_icon, 'Icon circle mode', icon_circle);
        this.modes.text = this.toolbar.add_tool('text', text_icon, 'Icon text mode', icon_text);
        this.modes.terminal = this.toolbar.add_tool('terminal', terminal_icon, 'Icon terminal mode', icon_terminal);
        this.modes.property = this.toolbar.add_tool('property', property_icon, 'Icon property mode', icon_property);

        this.toolbar.add_spacer();

        // add external tools
        for (var i = 0; i < icon_tools.length; i += 1) {
            var info = icon_tools[i]; // [name,icon,tip,callback,enable_check]
            this.toolbar.add_tool(info[0], info[1], info[2], info[3], info[4]);
        }

        div.appendChild(this.toolbar.toolbar[0]);

        div.appendChild(this.diagram.canvas);
        this.aspect = new jade.Aspect('untitled', null);
        this.diagram.set_aspect(this.aspect);
    }

    Icon.prototype.resize = function(dx, dy, selected) {
        // schematic canvas
        var e = $(this.diagram.canvas);
        e.width(dx + e.width());
        e.height(dy + e.height());

        // adjust diagram to reflect new size
        if (selected) this.diagram.resize();
    };

    Icon.prototype.show = function() {
        this.diagram.canvas.focus(); // capture key strokes
        this.diagram.resize();
    };

    Icon.prototype.set_aspect = function(module) {
        this.diagram.set_aspect(module.aspect(Icon.prototype.editor_name));
    };

    Icon.prototype.editor_name = 'icon';
    jade.editors.push(Icon);

    Icon.prototype.redraw = function(diagram) {
        // draw our own grid-quantized cursor
        var editor = diagram.editor;
        if (editor.mode != 'select') {
            // "X" marks the spot
            var x = diagram.cursor_x;
            var y = diagram.cursor_y;
            diagram.c.strokeStyle = diagram.normal_style;
            diagram.draw_line(x - 2, y - 2, x + 2, y + 2, 0.1);
            diagram.draw_line(x + 2, y - 2, x - 2, y + 2, 0.1);

            diagram.c.textAlign = 'left';
            diagram.c.textBaseline = 'middle';
            diagram.c.fillStyle = diagram.normal_style;
            diagram.draw_text(editor.mode, x + 4, y, diagram.property_font);
        }
    };

    var icon_prompts = {
        'select': 'Click component to select, click and drag on background for area select',
        'line': 'Click and drag to draw line',
        'arc': 'Click and drag to draw chord, then click again to set radius',
        'circle': 'Click at center point, drag to set radisu',
        'text': 'Click to insert text',
        'terminal': 'Click to insert terminal',
        'property': 'Click to insert property tag'
    };

    Icon.prototype.set_mode = function(mode) {
        this.mode = mode;
        this.start_x = undefined;

        if (this.drag_callback) {
            this.drag_callback(undefined, undefined, 'abort');
            this.diagram.aspect.end_action();
            this.drag_callback = undefined;
        }

        var c = jade.built_in_components[mode];
        this.diagram.set_cursor_grid(c ? c.prototype.required_grid : 1);
        if (mode == 'select') this.diagram.canvas.style.cursor = 'auto';
        else
            // for component modes, we'll draw our own cursor in mouse_move
            this.diagram.canvas.style.cursor = 'none';

        // adjust className for mode tools to create visual indication
        for (var m in this.modes) {
            this.modes[m].toggleClass('icon-tool-selected', mode == m);
        }

        this.status.text(icon_prompts[mode]);
    };

    function icon_select(diagram) {
        diagram.editor.set_mode('select');
    }

    function icon_line(diagram) {
        diagram.editor.set_mode('line');
    }

    function icon_arc(diagram) {
        diagram.editor.set_mode('arc');
    }

    function icon_circle(diagram) {
        diagram.editor.set_mode('circle');
    }

    function icon_text(diagram) {
        diagram.editor.set_mode('text');
    }

    function icon_terminal(diagram) {
        diagram.editor.set_mode('terminal');
    }

    function icon_property(diagram) {
        diagram.editor.set_mode('property');
    }

    var select_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQw8MgDpr0TVMzB25zlfaH4nGA4oiV1vum1wur7abE0ermpsaoNrwTatTKkI6WnlEQAADs=';

    var line_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQb8MhJq704V6At79QHSuJYgmeXamvWYu8Vj2AEADs=';

    var arc_icon = 'data:image/gif;base64,R0lGODlhEAAQAIcAAEhISE5OTlFRUVdXV1paWmBgYGNjY2ZmZnh4eH5+foGBgY2NjY6OjpOTk5ycnKioqKurq7GxsbKysrS0tLe3t7i4uLq6ur6+vsDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAABgALAAAAAAQABAAAAhHADEIHEiwoMGDBQEIQBABYcEKDAQEaODQYIIBEyoSlCDggcaBFwhA+CjwQgAKJDFEMJASgwIHLQnEtJBywYKUFA60LNByYEAAOw==';

    var circle_icon = 'data:image/x-icon;base64,AAABAAEAEBAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAF4AAACyAAAA5QAAAPoAAADlAAAAsgAAAF4AAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAANIAAAC9AAAAWgAAABkAAAACAAAAGQAAAFoAAAC9AAAA0gAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAHwAAAP8AAACbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHoAAAD/AAAADwAAAAAAAAAAAAAABwAAANIAAAB6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnAAAANEAAAAHAAAAAAAAAF4AAAC9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC9AAAAXgAAAAAAAACyAAAAWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWQAAALMAAAAAAAAA5QAAABkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAADmAAAAAAAAAPoAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAA+gAAAAAAAADlAAAAGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAOYAAAAAAAAAsgAAAFoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFkAAACzAAAAAAAAAF4AAAC9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC9AAAAXgAAAAAAAAAHAAAA0gAAAJoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB7AAAA0gAAAAcAAAAAAAAAAAAAAA4AAAD/AAAAewAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACbAAAA/wAAACAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAANEAAAC9AAAAWQAAABgAAAACAAAAGAAAAFkAAAC9AAAA0gAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAXgAAALMAAADmAAAA+gAAAOYAAACzAAAAXgAAAAcAAAAAAAAAAAAAAAAAAAAA';

    var text_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQz8MhJq5UAXYsA2JWXgVInkodnalunnZtXqpc7weE3rZUp/rpbcEebsXJBWY32u/yOKEkEADs=';

    var property_icon = '{P}'; // just text

    var terminal_icon = 'data:image/x-icon;base64,AAABAAEAEBAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAACNAAAA4gAAAPoAAADiAAAAjQAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAADsAAAA/gAAACUAAAACAAAAJQAAAKUAAADrAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACNAAAAxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/gAAAI0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4gAAACUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQAAADiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPoAAAACAAAAAAAAAAAAAAD+AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP4AAADiAAAAJQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAOIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjQAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMQAAABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAADrAAAAxAAAACQAAAACAAAAJAAAAP8AAADqAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAI0AAADiAAAA+gAAAOIAAABsAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Event handling
    //
    ////////////////////////////////////////////////////////////////////////////////

    function icon_mouse_enter(event) {
        var diagram = event.target.diagram;

        diagram.canvas.focus(); // capture key strokes
        diagram.editor.status.text(icon_prompts[diagram.editor.mode]);

        event.preventDefault();
        return false;
    }

    function icon_mouse_leave(event) {
        var diagram = event.target.diagram;

        diagram.editor.status.text('');

        event.preventDefault();
        return false;
    }

    // process keystrokes, consuming those that are meaningful to us
    function icon_key_down(event) {
        var diagram = event.target.diagram;
        var code = event.keyCode;

        if (code == 32) diagram.editor.set_mode('select');
        else diagram.key_down(event);

        event.preventDefault();
        return false;
    }

    function icon_mouse_down(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        // see if user is trying to pan or zoom
        if (diagram.pan_zoom()) return false;

        var editor = diagram.editor;
        var cx = diagram.cursor_x;
        var cy = diagram.cursor_y;

        if (editor.mode == 'arc2') {
            // okay, we just captured third point for arc, finish up
            // and return to 'arc' mode
            editor.drag_callback(cx, cy, 'done');
            diagram.aspect.end_action();
            editor.drag_callback = undefined;
            editor.mode = 'arc';
        }
        else if (editor.mode != 'select') {
            editor.start_x = cx;
            editor.start_y = cy;
        }
        else diagram.start_select(event.shiftKey);

        event.preventDefault();
        return false;
    }

    function icon_new_component(diagram) {
        var editor = diagram.editor;

        diagram.unselect_all(-1);
        diagram.redraw_background();

        diagram.aspect.start_action();
        var c = jade.make_component([editor.mode, [editor.start_x, editor.start_y, 0]]);
        c.add(diagram.aspect);
        c.selected = true;

        editor.drag_callback = function(x, y, action) {
            if (action == 'abort' || !c.drag_callback(x, y, action)) {
                c.remove();
                diagram.redraw_background();
            }
            else diagram.redraw();
        };

        editor.start_x = undefined;
    }

    function icon_mouse_move(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        var editor = diagram.editor;

        if (editor.start_x !== undefined) icon_new_component(diagram);

        if (editor.drag_callback) editor.drag_callback(diagram.cursor_x, diagram.cursor_y, editor.mode);
        else diagram.mouse_move();

        event.preventDefault();
        return false;
    }

    function icon_mouse_up(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        var editor = diagram.editor;

        if (editor.start_x !== undefined) icon_new_component(diagram);

        if (editor.drag_callback) {
            var cx = diagram.cursor_x;
            var cy = diagram.cursor_y;

            if (editor.mode == 'arc') {
                editor.drag_callback(cx, cy, 'arc');
                editor.mode = 'arc2'; // now capture third point
            }
            else {
                editor.drag_callback(cx, cy, 'done');
                diagram.aspect.end_action();
                editor.drag_callback = undefined;
            }
        }
        else diagram.mouse_up(event.shiftKey);

        event.preventDefault();
        return false;
    }

    function icon_double_click(event) {
        var diagram = event.target.diagram;
        diagram.event_coords(event);

        // see if we double-clicked a component.  If so, edit it's properties
        diagram.aspect.map_over_components(function(c) {
            if (c.edit_properties(diagram, diagram.aspect_x, diagram.aspect_y)) return true;
            return false;
        });

        event.preventDefault();
        return false;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Built-in icon components
    //
    //////////////////////////////////////////////////////////////////////

    // line  (arc if you pull at the middle to provide a third point?)
    function Line(json) {
        jade.Component.call(this);
        this.module = line_module;
        this.load(json);
    }
    Line.prototype = new jade.Component();
    Line.prototype.constructor = Line;
    Line.prototype.required_grid = 1;
    jade.built_in_components.line = Line;
    var line_module = {
        properties: {}
    };

    var line_distance = 2; // how close to line counts as "near by"

    Line.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties
        this.setup_bbox();
    };

    Line.prototype.setup_bbox = function() {
        var dx = this.coords[3];
        var dy = this.coords[4];

        // compute bounding box (expanded slightly)
        var r = [0, 0, dx, dy];
        jade.canonicalize(r);
        r[0] -= line_distance;
        r[1] -= line_distance;
        r[2] += line_distance;
        r[3] += line_distance;
        this.bounding_box = r;
        this.update_coords(); // update bbox

        // used in selection calculations
        this.len = Math.sqrt(dx * dx + dy * dy);
    };

    Line.prototype.drag_callback = function(x, y, action) {
        this.coords[3] = x - this.coords[0];
        this.coords[4] = y - this.coords[1];

        if (action == 'done') {
            // remove degenerate line from diagram
            if (this.coords[3] === 0 && this.coords[4] == 0) return false;
            else this.setup_bbox();
        }
        return true;
    };

    Line.prototype.draw = function(diagram) {
        var dx = this.coords[3];
        var dy = this.coords[4];

        this.draw_line(diagram, 0, 0, dx, dy);
    };

    Line.prototype.draw_icon = function(c, diagram) {
        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0];
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];

        c.draw_line(diagram, this.coords[0], this.coords[1], x2, y2);
    };

    // compute distance between x,y and nearest point on line
    // http://www.allegro.cc/forums/thread/589720
    Line.prototype.distance = function(x, y) {
        var dx = this.transform_x(this.coords[3], this.coords[4]); // account for rotation
        var dy = this.transform_y(this.coords[3], this.coords[4]);
        var D = Math.abs((x - this.coords[0]) * dy - (y - this.coords[1]) * dx) / this.len;
        return D;
    };

    // does mous eclick fall on this component?
    Line.prototype.near = function(x, y) {
        // crude check: (x,y) within expanded bounding box of wire
        // final check: distance to nearest point on line is small
        if (this.inside(x, y) && this.distance(x, y) <= line_distance) return true;
        return false;
    };

    Line.prototype.select_rect = function(s) {
        this.was_previously_selected = this.selected;

        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0]; // account for rotation
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];
        if (this.inside(this.coords[0], this.coords[1], s) || this.inside(x2, y2, s)) this.set_select(true);
    };

    // line  (arc if you pull at the middle to provide a third point?)
    function Arc(json) {
        jade.Component.call(this);
        this.module = arc_module;
        this.load(json);
    }
    Arc.prototype = new jade.Component();
    Arc.prototype.constructor = Arc;
    Arc.prototype.required_grid = 1;
    jade.built_in_components.arc = Arc;
    var arc_module = {
        properties: {}
    };

    Arc.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties
        this.setup_bbox();
    };

    Arc.prototype.setup_bbox = function() {
        var dx = this.coords[3];
        var dy = this.coords[4];

        var ex = this.coords[5];
        var ey = this.coords[6];

        if (ex === undefined) {
            // we're just a line without the third point!
            Line.prototype.setup_bbox.call(this);
        }
        else {
            // compute bounding box enclosing all three points
            var r = [0, 0, dx, dy];
            jade.canonicalize(r);
            if (ex < r[0]) r[0] = ex;
            else if (ex > r[2]) r[2] = ex;
            if (ey < r[1]) r[1] = ey;
            else if (ey > r[3]) r[3] = ey;
            jade.canonicalize(r);
            this.bounding_box = r;
            this.update_coords(); // update bbox
        }
    };

    Arc.prototype.drag_callback = function(x, y, action) {
        if (action == 'arc') {
            this.coords[3] = x - this.coords[0];
            this.coords[4] = y - this.coords[1];
        }
        else {
            this.coords[5] = x - this.coords[0];
            this.coords[6] = y - this.coords[1];
        }

        if (action == 'done') {
            // remove degenerate arc from diagram
            if (this.coords[3] === 0 && this.coords[4] == 0) return false;
            this.setup_bbox();
        }
        return true;
    };

    // draw circle segment from coords[0,1] to coords[3,4] that passes through coords[5,6]
    Arc.prototype.draw = function(diagram) {
        var x3, y3;
        if (this.coords[5] !== undefined) {
            x3 = this.coords[5];
            y3 = this.coords[6];
        }
        else {
            x3 = this.coords[3]; // no third point, pretend it's a line
            y3 = this.coords[4];
        }

        this.draw_arc(diagram, 0, 0, this.coords[3], this.coords[4], x3, y3);
    };

    Arc.prototype.draw_icon = function(c, diagram) {
        var x2 = this.transform_x(this.coords[3], this.coords[4]) + this.coords[0];
        var y2 = this.transform_y(this.coords[3], this.coords[4]) + this.coords[1];

        var x3, y3;
        if (this.coords[5] !== undefined) {
            x3 = this.transform_x(this.coords[5], this.coords[6]) + this.coords[0];
            y3 = this.transform_y(this.coords[5], this.coords[6]) + this.coords[1];
        }
        else {
            x3 = x2;
            y3 = y2;
        }

        c.draw_arc(diagram, this.coords[0], this.coords[1], x2, y2, x3, y3);
    };

    var text_alignments = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];

    // crude estimate of bbox for aligned text
    function text_bbox(text, align) {
        var h = 8;
        var w = 4 * (text ? text.length : 0);
        var bbox = [0, 0, 0, 0];

        var position = align.split('-');

        // adjust for alignment
        var vertical = position[0];
        if (vertical == 'top') {
            bbox[1] = 0;
            bbox[3] = h;
        }
        else if (vertical == 'center') {
            bbox[1] = -h / 2;
            bbox[3] = h / 2;
        }
        else {
            bbox[1] = -h;
            bbox[3] = 0;
        }

        var horizontal = position[1] || position[0];
        if (horizontal == 'left') {
            bbox[0] = 0;
            bbox[2] = w;
        }
        else if (horizontal == 'center') {
            bbox[0] = -w / 2;
            bbox[2] = w / 2;
        }
        else {
            bbox[0] = -w;
            bbox[2] = 0;
        }

        return bbox;
    }

    // text, aligned around reference point
    function Text(json) {
        jade.Component.call(this);
        this.module = text_module;
        this.load(json);
    }
    Text.prototype = new jade.Component();
    Text.prototype.constructor = Text;
    Text.prototype.required_grid = 1;
    jade.built_in_components.text = Text;
    var text_module = {
        properties: {
            "text": {
                "type": "string",
                "label": "Text",
                "value": "???",
                "edit": "yes"
            },
            "font": {
                "type": "string",
                "label": "CSS Font",
                "value": "6pt sans-serif",
                "edit": "yes"
            },
            "align": {
                "type": "menu",
                "label": "Alignment",
                "value": "center-left",
                "edit": "yes",
                "choices": text_alignments
            }
        }
    };

    Text.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        this.bounding_box = text_bbox(this.properties.text, this.properties.align);
        this.update_coords();
    };

    Text.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Text.prototype.draw = function(diagram) {
        // "+" marks the reference point for the property
        this.draw_line(diagram, - 1, 0, 1, 0);
        this.draw_line(diagram, 0, - 1, 0, 1);

        var align = text_alignments.indexOf(this.properties.align);
        this.draw_text(diagram, this.properties.text, 0, 0, align, this.properties.font);
    };

    Text.prototype.draw_icon = function(c, diagram) {
        // need to adjust alignment accounting for our rotation
        var align = text_alignments.indexOf(this.properties.align);
        align = jade.aOrient[this.coords[2] * 9 + align];

        c.draw_text(diagram, this.properties.text, this.coords[0], this.coords[1], align, this.properties.font);
    };

    Text.prototype.edit_properties = function(diagram, x, y) {
        return jade.Component.prototype.edit_properties.call(this, diagram, x, y, function(c) {
            c.bounding_box = text_bbox(c.properties.text, c.properties.align);
            c.update_coords();
        });
    };

    // circle: center point + radius
    function Circle(json) {
        jade.Component.call(this);
        this.module = circle_module;
        this.load(json);
    }
    Circle.prototype = new jade.Component();
    Circle.prototype.constructor = Circle;
    Circle.prototype.required_grid = 1;
    jade.built_in_components.circle = Circle;
    var circle_module = {
        properties: {}
    };

    Circle.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties
        this.setup_bbox();
    };

    Circle.prototype.setup_bbox = function() {
        var radius = this.coords[3];
        this.bounding_box = [-radius, - radius, radius, radius];
        this.update_coords(); // update bbox
    };

    Circle.prototype.drag_callback = function(x, y, action) {
        var dx = x - this.coords[0];
        var dy = y - this.coords[1];
        this.coords[3] = Math.sqrt(dx * dx + dy * dy);

        if (action == 'done') {
            // remove degenerate circle from diagram
            if (this.coords[3] === 0) return false;
            else this.setup_bbox();
        }
        return true;
    };

    Circle.prototype.draw = function(diagram) {
        this.draw_circle(diagram, 0, 0, this.coords[3], false);
    };

    Circle.prototype.draw_icon = function(c, diagram) {
        c.draw_circle(diagram, this.coords[0], this.coords[1], this.coords[3], false);
    };

    // display of one or more module properties, aligned to reference point
    function Property(json) {
        jade.Component.call(this);
        this.module = property_module;
        this.load(json);
    }
    Property.prototype = new jade.Component();
    Property.prototype.constructor = Property;
    Property.prototype.required_grid = 1;
    jade.built_in_components.property = Property;
    var property_module = {
        properties: {
            "format": {
                "type": "string",
                "label": "Format",
                "value": "{???}",
                "edit": "yes"
            },
            "align": {
                "type": "menu",
                "label": "Alignment",
                "value": "center-left",
                "edit": "yes",
                "choices": text_alignments
            }
        }
    };

    Property.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        this.bounding_box = text_bbox(this.properties.format, this.properties.align);
        this.update_coords();
    };

    Property.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Property.prototype.draw = function(diagram) {
        // "+" marks the reference point for the property
        this.draw_line(diagram, - 1, 0, 1, 0);
        this.draw_line(diagram, 0, - 1, 0, 1);

        var align = text_alignments.indexOf(this.properties.align);
        this.draw_text(diagram, this.properties.format || '-no format-', 0, 0, align, diagram.property_font);
    };

    Property.prototype.draw_icon = function(c, diagram) {
        // replace occurences of {pname} in format with the
        // corresponding property value
        var s = this.properties.format || '-no format-';
        for (var p in c.properties) {
            var v = c.properties[p] || '';
            s = s.replace(new RegExp("\\{" + p + "\\}", "gm"), v);
        }

        // need to adjust alignment accounting for our rotation
        var align = text_alignments.indexOf(this.properties.align);
        align = jade.aOrient[this.coords[2] * 9 + align];

        c.draw_text(diagram, s, this.coords[0], this.coords[1], align, diagram.property_font);
    };

    Property.prototype.edit_properties = function(diagram, x, y) {
        return jade.Component.prototype.edit_properties.call(this, diagram, x, y, function(c) {
            c.bounding_box = text_bbox(c.properties.format, c.properties.align);
            c.update_coords();
        });
    };

    // icon terminal (turns into connection point when module is instantiated)
    function Terminal(json) {
        jade.Component.call(this);
        this.module = terminal_module;
        this.load(json);
    }
    Terminal.prototype = new jade.Component();
    Terminal.prototype.constructor = Terminal;
    Terminal.prototype.required_grid = 8;
    jade.built_in_components.terminal = Terminal;
    var terminal_module = {
        properties: {
            "name": {
                "type": "string",
                "label": "Terminal name",
                "value": "???",
                "edit": "yes"
            },
            "line": {
                "type": "menu",
                "label": "Draw line",
                "value": "yes",
                "edit": "yes",
                "choices": ["yes", "no"]
            }
        }
    };

    Terminal.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        this.bounding_box = [-jade.connection_point_radius, - jade.connection_point_radius,
                             8 + jade.connection_point_radius, jade.connection_point_radius];
        this.update_coords();
    };

    Terminal.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Terminal.prototype.draw = function(diagram) {
        this.draw_circle(diagram, 0, 0, jade.connection_point_radius, false);
        if (this.properties.line != 'no') this.draw_line(diagram, 0, 0, 8, 0);
        this.draw_text(diagram, this.properties.name, jade.connection_point_radius - 4, 0, 5, diagram.property_font);
    };

    Terminal.prototype.draw_icon = function(c, diagram) {
        if (this.properties.line != 'no') {
            var x1 = this.coords[0];
            var y1 = this.coords[1];
            var x2 = this.transform_x(8, 0) + this.coords[0];
            var y2 = this.transform_y(8, 0) + this.coords[1];

            c.draw_line(diagram, x1, y1, x2, y2);
        }
    };

    Terminal.prototype.terminal_coords = function() {
        return [this.coords[0], this.coords[1], this.properties.name];
    };

    //////////////////////////////////////////////////////////////////////
    //
    // Property editor
    //
    //////////////////////////////////////////////////////////////////////

    function PropertyEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;

        this.table = document.createElement('table');
        this.table.className = 'jade-property-table';
        div.appendChild(this.table);
        this.build_table();
    }

    PropertyEditor.prototype.resize = function(dx, dy, selected) {};

    PropertyEditor.prototype.show = function() {};

    PropertyEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.build_table();
    };

    PropertyEditor.prototype.build_table = function() {
        var editor = this; // for closures
        var tr, td, field;

        // remove old rows from table
        $(this.table).empty();

        if (editor.module === undefined) {
            this.table.innerHTML = '<tr><td>To edit properites you must first specify a module.</td></tr>';
            return;
        }

        // header row
        tr = document.createElement('tr');
        this.table.appendChild(tr);
        tr.innerHTML = '<th>Action</th><th>Name</th><th>Label</th><th>Type</th><th>Value</th><th>Edit</th><th>Choices</th>';

        // one row for each existing property
        for (var p in editor.module.properties) {
            var props = editor.module.properties[p];
            tr = document.createElement('tr');
            this.table.appendChild(tr);

            // action
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_button('delete', function(event) {
                // remove property, rebuild table
                editor.module.remove_property(event.target.pname);
                editor.build_table();
            });
            field.pname = p; // so callback knows what to delete
            td.appendChild(field);

            // name (not editable)
            td = document.createElement('td');
            tr.appendChild(td);
            td.appendChild(document.createTextNode(p));

            // label
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 10, props.label || props.name);
            field.pname = p;
            field.props = props;
            $(field).change(function(event) {
                var v = event.target.value.trim();
                if (v === '') {
                    v = event.target.pname; // default label is property name
                    event.target.value = v;
                }
                event.target.props.label = v;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // type
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_select(['string', 'menu'], props.type || 'string');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.type = event.target.value;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // value
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 10, props.value || '');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.value = event.target.value.trim();
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // edit
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_select(['yes', 'no'], props.edit || 'yes');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.edit = event.target.value;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // choices
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 15, props.choices ? props.choices.join() : '');
            field.props = props;
            $(field).change(function(event) {
                var vlist = event.target.value.split(',');
                for (var i = 0; i < vlist.length; i += 1) {
                    vlist[i] = vlist[i].trim();
                }
                event.target.props.choices = vlist;
                event.target.value = vlist.join();
                editor.module.set_modified(true);
            });
            td.appendChild(field);
        }

        // last row for adding properties
        tr = document.createElement('tr');
        this.table.appendChild(tr);

        var fields = {};
        fields.action = jade.build_button('add', function(event) {
            // validate then add new property
            var name = fields.name.value.trim();
            if (name === '') alert('Please enter a name for the new property');
            else if (name in editor.module.properties) alert('Oops, duplicate property name!');
            else {
                var p = {};
                p.label = fields.label.value.trim() || name;
                p.type = fields.type.value;
                p.value = fields.value.value.trim();
                p.edit = fields.edit.value;
                var vlist = fields.choices.value.split(',');
                for (var i = 0; i < vlist.length; i += 1) {
                    vlist[i] = vlist[i].trim();
                }
                p.choices = vlist;
                editor.module.set_property(name, p);

                editor.build_table();
            }
        });
        fields.name = jade.build_input('text', 10, '');
        fields.label = jade.build_input('text', 10, '');
        fields.type = jade.build_select(['string', 'menu'], 'string');
        fields.value = jade.build_input('text', 10, '');
        fields.edit = jade.build_select(['yes', 'no'], 'yes');
        fields.choices = jade.build_input('text', 15, '');

        for (var f in fields) {
            td = document.createElement('td');
            tr.appendChild(td);
            td.appendChild(fields[f]);
        }
    };

    PropertyEditor.prototype.editor_name = 'properties';
    jade.editors.push(PropertyEditor);

    //////////////////////////////////////////////////////////////////////
    //
    // Test editor
    //
    //////////////////////////////////////////////////////////////////////

    /* example test script:

     // set up Vdd, establish signaling voltages
     .power Vdd=1
     .thresholds Vol=0 Vil=0.1 Vih=0.9 Voh=1

     // test actions are applied to named groups of signals.
     // A signal can appear in more than one group.  Order
     // of groups and signals within each group determine 
     // order of values on each line of test values
     .group inputs A B
     .group outputs Z

     // tests are sequences of lines supplying test values; .cycle specifies
     // actions that will be performed for each test.  Available actions are
     //   assert <group> -- set values for signals in <group> with H,L test values
     //   deassert <group> -- stop setting values for signals in <group> with H,L test values
     //   sample <group> -- check values of signals in <group> with 0,1 test values
     //   tran <time> -- run transient simulation for specified time interval
     //   <signal>=<val> -- set signal to specified value
     .cycle assert inputs tran 9n sample outputs tran 1n

     // the tests themselves -- one test per line
     //   to assert signal this cycle use 0,1,Z
     //   to sample signal this cycle use L,H
     //   use - if signal shouldn't be asserted/sampled
     // whitespace can be used to improve readability
     00 L
     01 H
     10 H 
     11 L

     */

    function TestEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;
        this.aspect = undefined;
        this.test_component = undefined;

        this.toolbar = new jade.Toolbar(this);
        this.toolbar.add_tool('check', check_icon, 'Check: run tests',
                              function(testeditor) {
                                  testeditor.check();
                              });
        this.toolbar.enable_tools();

        div.appendChild(this.toolbar.toolbar[0]);

        var textarea = $('<textarea class="jade-test-editor"></textarea>');
        this.textarea = textarea;
        // on changes, update test component of module's test aspect
        var editor = this;  // for closure
        textarea.on('mouseleave',function() {
            if (editor.test_component) {
                var text = textarea.val();
                if (editor.test_component.test != text) {
                    editor.test_component.test = text;
                    editor.aspect.set_modified(true);
                }
            }
        });
        div.appendChild(textarea[0]);
    }

    TestEditor.prototype.resize = function(dx, dy, selected) {
        var e = this.textarea;
        e.width(dx + e.width());
        e.height(dy + e.height());
    };

    TestEditor.prototype.show = function() {};

    TestEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.aspect = module.aspect('test');
        this.test_component = this.aspect.components[0];
        if (this.test_component === undefined) {
            this.test_component = jade.make_component(["test",""]);
            this.aspect.add_component(this.test_component);
        }
        this.textarea.val(this.test_component.test);
    };

    TestEditor.prototype.event_coords = function () { };

    TestEditor.prototype.check = function () {
        var source = this.textarea.val();

        // remove multiline comments, in-line comments
        source = source.replace(/\/\*(.|\n)*?\*\//g,'');   // multi-line using slash-star
        source = source.replace(/\/\/.*\n/g,'\n');

        var i,j,k,v;
        var plots = [];     // list of signals to plot
        var tests = [];     // list of test lines
        var power = {};     // node name -> voltage
        var thresholds = {};  // spec name -> voltage
        var cycle = [];    // list of test actions: [action args...]
        var groups = {};   // group name -> list of indicies
        var signals = [];  // list if signals in order that they'll appear on test line
        var driven_signals = {};   // if name in dictionary it will need a driver ckt
        var sampled_signals = {};   // if name in dictionary we want its value
        var errors = [];

        // process each line in test specification
        source = source.split('\n');
        for (k = 0; k < source.length; k += 1) {
            var line = source[k].match(/([A-Za-z0-9_.\[\]]+|=|-)/g);
            if (line === null) continue;
            if (line[0] == '.power' || line[0] == '.thresholds') {
                // .power/.thresholds name=float name=float ...
                for (i = 1; i < line.length; i += 3) {
                    if (i + 2 >= line.length || line[i+1] != '=') {
                        errors.push('Malformed '+line[0]+' statement: '+source[k]);
                        break;
                    }
                    v = parse_number(line[i+2]);
                    if (isNaN(v)) {
                        errors.push('Unrecognized voltage specification "'+line[i+2]+'": '+source[k]);
                        break;
                    }
                    if (line[0] == '.power') power[line[i]] = v;
                    else thresholds[line[i]] = v;
                }
            }
            else if (line[0] == '.group') {
                // .group group_name name...
                if (line.length < 3) {
                    errors.push('Malformed .group statement: '+source[k]);
                } else {
                    // each group has an associated list of signal indicies
                    groups[line[1]] = [];
                    for (j = 2; j < line.length; j += 1) {
                        // remember index of this signal in the signals list
                        groups[line[1]].push(signals.length);
                        // keep track of signal names
                        signals.push(line[j]);
                    }
                }
            }
            else if (line[0] == '.plot') {
                for (j = 1; j < line.length; j += 1) {
                    plots.push(line[j]);
                    sampled_signals[line[j]] = [];
                }
            }
            else if (line[0] == '.cycle') {
                // .cycle actions...
                //   assert <group_name>
                //   deassert <group_name>
                //   sample <group_name>
                //   tran <duration>
                //   <name> = <voltage>
                if (cycle.length != 0) {
                    errors.push('More than one .cycle statement: '+source[k]);
                    break;
                }
                i = 1;
                while (i < line.length) {
                    if ((line[i] == 'assert' || line[i] == 'deassert' || line[i] == 'sample') && i + 1 < line.length) {
                        var glist = groups[line[i+1]];
                        if (glist === undefined) {
                            errors.push('Use of undeclared group name "'+line[i+1]+'" in .cycle: '+source[k]);
                            break;
                        }
                        // keep track of which signals are driven and sampled
                        for (j = 0; j < glist.length; j += 1) {
                            if (line[i] == 'assert' || line[i] == 'deassert')
                                driven_signals[signals[glist[j]]] = [[0,'Z']]; // driven node is 0 at t=0
                            if (line[i] == 'sample')
                                sampled_signals[signals[glist[j]]] = []; // list of tvpairs
                        }
                        cycle.push([line[i],line[i+1]]);
                        i += 2;
                        continue;
                    }
                    else if (line[i] == 'tran' && (i + 1 < line.length)) {
                        v = parse_number(line[i+1]);
                        if (isNaN(v)) {
                            errors.push('Unrecognized tran duration "'+line[i+1]+'": '+source[k]);
                            break;
                        }
                        cycle.push(['tran',v]);
                        i += 2;
                        continue;
                    }
                    else if (line[i+1] == '=' && (i + 2 < line.length)) {
                        v = line[i+2];   // expect 0,1,Z
                        if ("01Z".indexOf(v) == -1) {
                            errors.push('Unrecognized value specification "'+line[i+2]+'": '+source[k]);
                            break;
                        }
                        cycle.push(['set',line[i],v]);
                        driven_signals[line[i]] = [[0,'Z']];  // driven node is 0 at t=0
                        i += 3;
                        continue;
                    }
                    errors.push('Malformed .cycle action "'+line[i]+'": '+source[k]);
                    break;
                }
            }
            else if (line[0][0] == '.') {
                errors.push('Unrecognized control statment: '+source[k]);
            }
            else {
                var test = line.join('');
                // each test should specify values for each signal in each group
                if (test.length != signals.length) {
                    errors.push('Test line does not specify '+signals.length+' signals: '+source[k]);
                    break;
                }
                // check for legal test values
                for (j = 0; j < test.length; j += 1) {
                    if ("01ZLH-".indexOf(test[j]) == -1) {
                        errors.push('Illegal test value '+test[j]+': '+source[k]);
                        break;
                    }
                }
                tests.push(test);
            }
        };

        // check for necessary threshold specs
        if (!('Vol' in thresholds)) errors.push('Missing Vol threshold specification');
        if (!('Vil' in thresholds)) errors.push('Missing Vil threshold specification');
        if (!('Vih' in thresholds)) errors.push('Missing Vih threshold specification');
        if (!('Voh' in thresholds)) errors.push('Missing Voh threshold specification');

        if (cycle.length == 0) errors.push('Missing .cycle specification');
        if (tests.length == 0) errors.push('No tests specified!');

        if (errors.length != 0) {
            this.status.html('The following errors were found in the test specification:<li>'+errors.join('<li>'));
            return;
        }

        //console.log('power: '+JSON.stringify(power));
        //console.log('thresholds: '+JSON.stringify(thresholds));
        //console.log('groups: '+JSON.stringify(groups));
        //console.log('cycle: '+JSON.stringify(cycle));
        //console.log('tests: '+JSON.stringify(tests));

        // extract netlist and make sure it has the signals referenced by the test
        if (!this.module.has_aspect('schematic')) {
            this.status.text('This module does not have a schematic!');
            return;
        }

        var netlist;
        var mlist = ['ground'];
        $.each(jade.libraries.analog.modules,function (mname,module) { mlist.push(module.get_name()); });
        try {
            netlist = this.module.aspect('schematic').netlist(mlist, '', {});
            netlist = cktsim_netlist(netlist);
        }
        catch (e) {
            this.status.html("Error extracting netlist:<p>" + e);
            return;
        }

        var nodes = extract_nodes(netlist);  // get list of nodes in netlist
        function check_node(node) {
            if (nodes.indexOf(node) == -1)
                errors.push('Circuit does not have a node named "'+node+'".');
        }
        $.each(driven_signals,check_node);
        $.each(sampled_signals,check_node);

        if (errors.length != 0) {
            this.status.html('The following errors were found in the test specification:<li>'+errors.join('<li>'));
            return;
        }

        // ensure cktsim knows what gnd is
        netlist.push({type: 'ground',connections:['gnd'],properties:{}});

        // add voltage sources for power supplies
        $.each(power,function(node,v) {
            netlist.push({type:'voltage source',
                          connections:{nplus:node, nminus:'gnd'},
                          properties:{value:{type:'dc', args:[v]}, name:node+'_source'}});
        });

        // add pullup and pulldown FETs for driven nodes, connected to sources for Voh and Vol
        netlist.push({type: 'voltage source',
                      connections:{nplus: '_Voh_', nminus: 'gnd'},
                      properties:{name: '_Voh_source', value:{type:'dc',args:[thresholds.Voh]}}});
        netlist.push({type: 'voltage source',
                      connections:{nplus: '_Vol_', nminus: 'gnd'},
                      properties:{name: '_Voh_source', value:{type:'dc',args:[thresholds.Vol]}}});
        $.each(driven_signals,function(node) {
            netlist.push({type:'pfet',
                          connections:{D:'_Voh_', G:node+'_pullup', S:node},
                          properties:{W:8, L:1,name:node+'_pullup'}});
            netlist.push({type:'nfet',
                          connections:{D:node ,G:node+'_pulldown', S:'_Vol_'},
                          properties:{W:8, L:1,name:node+'_pulldown'}});
        });

        // go through each test determining transition times for each driven node, adding
        // [t,v] pairs to driven_nodes dict.  v = '0','1','Z'
        var time = 0;
        function set_voltage(tvlist,v) {
            if (v != tvlist[tvlist.length - 1][1]) tvlist.push([time,v]);
        }
        $.each(tests,function(tindex,test) {
            $.each(cycle,function(index,action) {
                if (action[0] == 'assert' || action[0] == 'deassert') {
                    $.each(groups[action[1]],function(index,sindex) {
                        if (action[0] == 'deassert' || "01Z".indexOf(test[sindex]) != -1)
                            set_voltage(driven_signals[signals[sindex]],
                                        action[0] == 'deassert' ? 'Z' : test[sindex]);
                    });
                }
                else if (action[0] == 'sample') {
                    $.each(groups[action[1]],function(index,sindex) {
                        if ("HL".indexOf(test[sindex]) != -1)
                            sampled_signals[signals[sindex]].push([time,test[sindex]]);
                    });
                }
                else if (action[0] == 'set') {
                    set_voltage(driven_signals[action[1]],action[2]);
                }
                else if (action[0] == 'tran') {
                    time += action[1];
                }
            });
        });

        // construct PWL voltage sources to control pullups/pulldowns for driven nodes
        $.each(driven_signals,function(node,tvlist) {
            var pulldown = [0,thresholds.Vol];   // initial <t,v> for pulldown (off)
            var pullup = [0,thresholds.Voh];     // initial <t,v> for pullup (off)
            // run through tvlist, setting correct values for pullup and pulldown gates
            $.each(tvlist,function(index,tvpair) {
                var t = tvpair[0];
                var v = tvpair[1];
                var pu,pd;
                if (v == '0') {
                    // want pulldown on, pullup off
                    pd = thresholds.Voh;
                    pu = thresholds.Voh;
                }
                else if (v == '1') {
                    // want pulldown off, pullup on
                    pd = thresholds.Vol;
                    pu = thresholds.Vol;
                }
                else if (v == 'Z') {
                    // want pulldown off, pullup off
                    pd = thresholds.Vol;
                    pu = thresholds.Voh;
                }
                else
                    console.log('node: '+node+', tvlist: '+JSON.stringify(tvlist));
                // ramp to next control voltage over 0.1ns
                var last_pu = pullup[pullup.length - 1];
                if (last_pu != pu) {
                    if (t != pullup[pullup.length - 2])
                        pullup.push.apply(pullup,[t,last_pu]);
                    pullup.push.apply(pullup,[t+0.1e-9,pu]);
                }
                var last_pd = pulldown[pulldown.length - 1];
                if (last_pd != pd) {
                    if (t != pulldown[pulldown.length - 2])
                        pulldown.push.apply(pulldown,[t,last_pd]);
                    pulldown.push.apply(pulldown,[t+0.1e-9,pd]);
                }
            });
            // set up voltage sources for gates of pullup and pulldown
            netlist.push({type: 'voltage source',
                          connections: {nplus: node+'_pullup', nminus: 'gnd'},
                          properties: {name: node+'_pullup_source', value: {type: 'pwl', args: pullup}}});
            netlist.push({type: 'voltage source',
                          connections: {nplus: node+'_pulldown', nminus: 'gnd'},
                          properties: {name: node+'_pulldown_source', value: {type: 'pwl', args: pulldown}}});
        });
        //console.log('stop time: '+time);
        //print_netlist(netlist);

        // do the simulation
        var editor = this;  // for closure
        cktsim.transient_analysis(netlist, time, Object.keys(sampled_signals), function(percent_complete,results) {
            if (percent_complete === undefined) {
                // check the sampled node values for each test cycle
                var errors = [];
                $.each(sampled_signals,function(node,tvlist) {
                    var times = results[node].xvalues;
                    var observed = results[node].yvalues;
                    $.each(tvlist,function(index,tvpair) {
                        var v = interpolate(tvpair[0], times, observed);
                        if ((tvpair[1] == 'L' && v > thresholds.Vil) ||
                            (tvpair[1] == 'H' && v < thresholds.Vih)) 
                            errors.push('Expected signal '+node+' to be a valid '+tvpair[1]+
                                        ' at time '+engineering_notation(tvpair[0],2)+'s.');
                    });
                });
                if (errors.length > 0) {
                    var postscript = '';
                    if (errors.length > 3) {
                        errors = errors.slice(0,5);
                        postscript = '<br>...';
                    }
                    editor.status.html('<li>'+errors.join('<li>')+postscript);
                }
                else editor.status.text('Test succesful!');

                // construct a data set for the given signal
                function new_dataset(signal) {
                    if (results[signal] !== undefined) {
                        return {xvalues: results[signal].xvalues,
                                yvalues: results[signal].yvalues,
                                name: signal,
                                xunits: 's',
                                yunits: 'V'
                               };
                    } else return undefined;
                }

                // called by plot.graph when user wants to plot another signal
                function add_plot(callback) {
                    // use dialog to get new signal name
                    var fields = {'Signal name': jade.build_input('text',10,'')};
                    var content = jade.build_table(fields);
                    jade.dialog('Add Plot', content, function() {
                        var signal = fields['Signal name'].value;

                        // construct data set for requested signal
                        // if the signal was legit, use callback to plot it
                        var dataset = new_dataset(signal);
                        if (dataset !== undefined) {
                            callback(dataset);
                        }
                    },editor.textarea.offset());
                }

                // produce requested plots
                if (plots.length > 0) {
                    var dataseries = []; // plots we want
                    $.each(plots,function(index,signal) {
                        dataseries.push(new_dataset(signal));
                    });

                    // callback to use if user wants to add a new plot
                    dataseries.add_plot = add_plot;  

                    // graph the result and display in a window
                    var graph1 = plot.graph(dataseries);
                    var offset = editor.textarea.offset();
                    var win = jade.window('Test Results',graph1,offset);

                    // resize window to 75% of test pane
                    var win_w = win.width();
                    var win_h = win.height();
                    win[0].resize(Math.floor(0.75*editor.textarea.width()) - win_w,
                                  Math.floor(0.75*editor.textarea.height()) - win_h);
                }
            }
        });
    };

    TestEditor.prototype.message = function(msg) {
        this.status.text(msg);
    };

    TestEditor.prototype.clear_message = function(msg) {
        if (this.status.text() == msg)
            this.status.text('');
    };

    TestEditor.prototype.editor_name = 'test';
    jade.editors.push(TestEditor);

    // Test component that lives inside a Test aspect
    function Test(json) {
        jade.Component.call(this);
        this.load(json);
    }
    Test.prototype = new jade.Component();
    Test.prototype.constructor = Test;
    jade.built_in_components.test = Test;

    Test.prototype.load = function(json) {
        this.type = json[0];
        this.test = json[1];
    };

    Test.prototype.json = function() {
        return [this.type, this.test];
    };

    //////////////////////////////////////////////////////////////////////
    //
    // utilities
    //
    //////////////////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Parse numbers in engineering notation
    //
    ///////////////////////////////////////////////////////////////////////////////

    // convert string argument to a number, accepting usual notations
    // (hex, octal, binary, decimal, floating point) plus engineering
    // scale factors (eg, 1k = 1000.0 = 1e3).
    // return default if argument couldn't be interpreted as a number
    function parse_number(x, default_v) {
        var m;

        m = x.match(/^\s*([\-+]?)0x([0-9a-fA-F]+)\s*$/); // hex
        if (m) return parseInt(m[1] + m[2], 16);

        m = x.match(/^\s*([\-+]?)0b([0-1]+)\s*$/); // binary
        if (m) return parseInt(m[1] + m[2], 2);

        m = x.match(/^\s*([\-+]?)0([0-7]+)\s*$/); // octal
        if (m) return parseInt(m[1] + m[2], 8);

        m = x.match(/^\s*[\-+]?[0-9]*(\.([0-9]+)?)?([eE][\-+]?[0-9]+)?\s*$/); // decimal, float
        if (m) return parseFloat(m[0]);

        m = x.match(/^\s*([\-+]?[0-9]*(\.([0-9]+)?)?)(a|A|f|F|g|G|k|K|m|M|n|N|p|P|t|T|u|U)\s*$/); // decimal, float
        if (m) {
            var result = parseFloat(m[1]);
            var scale = m[4];
            if (scale == 'P') result *= 1e15; // peta
            else if (scale == 't' || scale == 'T') result *= 1e12; // tera
            else if (scale == 'g' || scale == 'G') result *= 1e9; // giga
            else if (scale == 'M') result *= 1e6; // mega
            else if (scale == 'k' || scale == 'K') result *= 1e3; // kilo
            else if (scale == 'm') result *= 1e-3; // milli
            else if (scale == 'u' || scale == 'U') result *= 1e-6; // micro
            else if (scale == 'n' || scale == 'N') result *= 1e-9; // nano
            else if (scale == 'p') result *= 1e-12; // pico
            else if (scale == 'f' || scale == 'F') result *= 1e-15; // femto
            else if (scale == 'a' || scale == 'A') result *= 1e-18; // atto
            return result;
        }

        return (default_v || NaN);
    }

    // try to parse a number and generate an alert if there was a syntax error
    function parse_number_alert(s) {
        var v = parse_number(s, undefined);

        if (v === undefined) throw 'The string \"' + s + '\" could not be interpreted as an integer, a floating-point number or a number using engineering notation. Sorry, expressions are not allowed in this context.';

        return v;
    }

    function engineering_notation(n, nplaces, trim) {
        if (n === 0) return '0';
        if (n === undefined) return 'undefined';
        if (trim === undefined) trim = true;

        var sign = n < 0 ? -1 : 1;
        var log10 = Math.log(sign * n) / Math.LN10;
        var exp = Math.floor(log10 / 3); // powers of 1000
        var mantissa = sign * Math.pow(10, log10 - 3 * exp);

        // keep specified number of places following decimal point
        var mstring = (mantissa + sign * 0.5 * Math.pow(10, - nplaces)).toString();
        var mlen = mstring.length;
        var endindex = mstring.indexOf('.');
        if (endindex != -1) {
            if (nplaces > 0) {
                endindex += nplaces + 1;
                if (endindex > mlen) endindex = mlen;
                if (trim) {
                    while (mstring.charAt(endindex - 1) == '0') endindex -= 1;
                    if (mstring.charAt(endindex - 1) == '.') endindex -= 1;
                }
            }
            if (endindex < mlen) mstring = mstring.substring(0, endindex);
        }

        switch (exp) {
        case -5:
            return mstring + "f";
        case -4:
            return mstring + "p";
        case -3:
            return mstring + "n";
        case -2:
            return mstring + "u";
        case -1:
            return mstring + "m";
        case 0:
            return mstring;
        case 1:
            return mstring + "K";
        case 2:
            return mstring + "M";
        case 3:
            return mstring + "G";
        }

        // don't have a good suffix, so just print the number
        return n.toPrecision(nplaces);
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Source parsing
    //
    ///////////////////////////////////////////////////////////////////////////////

    // argument is a string describing the source's value (see comments for details)
    // source types: dc,step,square,triangle,sin,pulse,pwl,pwl_repeating

    // returns an object with the following attributes:
    //   fun -- name of source function
    //   args -- list of argument values
    //   value(t) -- compute source value at time t
    //   inflection_point(t) -- compute time after t when a time point is needed
    //   period -- repeat period for periodic sources (0 if not periodic)

    function parse_source(v) {
        // generic parser: parse v as either <value> or <fun>(<value>,...)
        var src = {};
        src.period = 0; // Default not periodic
        src.value = function(t) {
            return 0;
        }; // overridden below
        src.inflection_point = function(t) {
            return undefined;
        }; // may be overridden below

        var m = v.match(/^\s*(\w+)\s*\(([^\)]*)\)\s*$/); // parse f(arg,arg,...)
        if (m) {
            src.fun = m[1];
            src.args = m[2].split(/\s*,\s*/).map(parse_number_alert);
        }
        else {
            src.fun = 'dc';
            src.args = [parse_number_alert(v)];
        }
        //console.log(src.fun + ': ' + src.args);

        var v1,v2,voffset,va,td,tr,tf,freq,duty_cycle,pw,per,t_change,t1,t2,t3,t4,phase;

        // post-processing for constant sources
        // dc(v)
        if (src.fun == 'dc') {
            v1 = arg_value(src.args, 0, 0);
            src.args = [v];
            src.value = function(t) {
                return v1;
            }; // closure
        }

        // post-processing for impulse sources
        // impulse(height,width)
        else if (src.fun == 'impulse') {
            v1 = arg_value(src.args, 0, 1); // default height: 1
            v2 = Math.abs(arg_value(src.args, 2, 1e-9)); // default width: 1ns
            src.args = [v1, v2]; // remember any defaulted values
            pwl_source(src, [0, 0, v2 / 2, v1, v2, 0], false);
        }

        // post-processing for step sources
        // step(v_init,v_plateau,t_delay,t_rise)
        else if (src.fun == 'step') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            td = Math.max(0, arg_value(src.args, 2, 0)); // time step starts
            tr = Math.abs(arg_value(src.args, 3, 1e-9)); // default rise time: 1ns
            src.args = [v1, v2, td, tr]; // remember any defaulted values
            pwl_source(src, [td, v1, td + tr, v2], false);
        }

        // post-processing for square wave
        // square(v_init,v_plateau,freq,duty_cycle)
        else if (src.fun == 'square') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1Hz
            duty_cycle = Math.min(100, Math.abs(arg_value(src.args, 3, 50))); // default duty cycle: 0.5
            src.args = [v1, v2, freq, duty_cycle]; // remember any defaulted values

            per = freq === 0 ? Infinity : 1 / freq;
            t_change = 0.01 * per; // rise and fall time
            pw = 0.01 * duty_cycle * 0.98 * per; // fraction of cycle minus rise and fall time
            pwl_source(src, [0, v1, t_change, v2, t_change + pw,
                             v2, t_change + pw + t_change, v1, per, v1], true);
        }

        // post-processing for triangle
        // triangle(v_init,v_plateua,t_period)
        else if (src.fun == 'triangle') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1s
            src.args = [v1, v2, freq]; // remember any defaulted values

            per = freq === 0 ? Infinity : 1 / freq;
            pwl_source(src, [0, v1, per / 2, v2, per, v1], true);
        }

        // post-processing for pwl and pwlr sources
        // pwl[r](t1,v1,t2,v2,...)
        else if (src.fun == 'pwl' || src.fun == 'pwl_repeating') {
            pwl_source(src, src.args, src.fun == 'pwl_repeating');
        }

        // post-processing for pulsed sources
        // pulse(v_init,v_plateau,t_delay,t_rise,t_fall,t_width,t_period)
        else if (src.fun == 'pulse') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            td = Math.max(0, arg_value(src.args, 2, 0)); // time pulse starts
            tr = Math.abs(arg_value(src.args, 3, 1e-9)); // default rise time: 1ns
            tf = Math.abs(arg_value(src.args, 4, 1e-9)); // default rise time: 1ns
            pw = Math.abs(arg_value(src.args, 5, 1e9)); // default pulse width: "infinite"
            per = Math.abs(arg_value(src.args, 6, 1e9)); // default period: "infinite"
            src.args = [v1, v2, td, tr, tf, pw, per];

            t1 = td; // time when v1 -> v2 transition starts
            t2 = t1 + tr; // time when v1 -> v2 transition ends
            t3 = t2 + pw; // time when v2 -> v1 transition starts
            t4 = t3 + tf; // time when v2 -> v1 transition ends

            pwl_source(src, [t1, v1, t2, v2, t3, v2, t4, v1, per, v1], true);
        }

        // post-processing for sinusoidal sources
        // sin(v_offset,v_amplitude,freq_hz,t_delay,phase_offset_degrees)
        else if (src.fun == 'sin') {
            voffset = arg_value(src.args, 0, 0); // default offset voltage: 0V
            va = arg_value(src.args, 1, 1); // default amplitude: -1V to 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1Hz
            src.period = 1.0 / freq;

            td = Math.max(0, arg_value(src.args, 3, 0)); // default time delay: 0sec
            phase = arg_value(src.args, 4, 0); // default phase offset: 0 degrees
            src.args = [voffset, va, freq, td, phase];

            phase /= 360.0;

            // return value of source at time t
            src.value = function(t) { // closure
                if (t < td) return voffset + va * Math.sin(2 * Math.PI * phase);
                else return voffset + va * Math.sin(2 * Math.PI * (freq * (t - td) + phase));
            };

            // return time of next inflection point after time t
            src.inflection_point = function(t) { // closure
                if (t < td) return td;
                else return undefined;
            };
        }

        // object has all the necessary info to compute the source value and inflection points
        src.dc = src.value(0); // DC value is value at time 0
        return src;
    }

    function pwl_source(src, tv_pairs, repeat) {
        var nvals = tv_pairs.length;
        if (repeat) src.period = tv_pairs[nvals - 2]; // Repeat period of source
        if (nvals % 2 == 1) nvals -= 1; // make sure it's even!

        if (nvals <= 2) {
            // handle degenerate case
            src.value = function(t) {
                return nvals == 2 ? tv_pairs[1] : 0;
            };
            src.inflection_point = function(t) {
                return undefined;
            };
        }
        else {
            src.value = function(t) { // closure
                if (repeat)
                    // make time periodic if values are to be repeated
                    t = Math.fmod(t, tv_pairs[nvals - 2]);
                var last_t = tv_pairs[0];
                var last_v = tv_pairs[1];
                if (t > last_t) {
                    var next_t, next_v;
                    for (var i = 2; i < nvals; i += 2) {
                        next_t = tv_pairs[i];
                        next_v = tv_pairs[i + 1];
                        if (next_t > last_t) // defend against bogus tv pairs
                            if (t < next_t) return last_v + (next_v - last_v) * (t - last_t) / (next_t - last_t);
                        last_t = next_t;
                        last_v = next_v;
                    }
                }
                return last_v;
            };
            src.inflection_point = function(t) { // closure
                if (repeat)
                    // make time periodic if values are to be repeated
                    t = Math.fmod(t, tv_pairs[nvals - 2]);
                for (var i = 0; i < nvals; i += 2) {
                    var next_t = tv_pairs[i];
                    if (t < next_t) return next_t;
                }
                return undefined;
            };
        }
    }

    // helper function: return args[index] if present, else default_v
    function arg_value(args, index, default_v) {
        var result = args[index];
        if (result === undefined) result = default_v;
        return result;
    }

    // we need fmod in the Math library!
    Math.fmod = function(numerator, denominator) {
        var quotient = Math.floor(numerator / denominator);
        return numerator - quotient * denominator;
    };

    var undo_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQj8MhJq704622JJ0hFTB4FmuPYoepKfld7fKUZcojM7XzvZxEAOw==';

    var redo_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQk8MhJq704630Q+YTmUd8UmldYoukqnRUId/Mh1wTC7Xzv/5QIADs=';

    var cut_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQu8MhJqz1g5qs7lxv2gRkQfuWomarXEgDRHjJhf3YtyRav0xcfcFgR0nhB5OwTAQA7';

    var copy_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQ+8MhJ6wE4Wwqef9gmdV8HiKZJrCz3ecS7TikWfzExvk+M9a0a4MbTkXCgTMeoHPJgG5+yF31SLazsTMTtViIAOw==';

    var paste_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAARL8MhJqwUYWJnxWp3GDcgAgCdQIqLKXmVLhhnyHiqpr7rME8AgocVDEB5IJHD0SyofBFzxGIQGAbvB0ZkcTq1CKK6z5YorwnR0w44AADs=';

    var grid_icon = 'data:image/gif;base64,R0lGODlhEAAQAMQAAAAAAP///zAwYT09bpGRqZ6et5iYsKWlvbi40MzM5cXF3czM5OHh5tTU2fDw84uMom49DbWKcfLy8g0NDcDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAABQALAAAAAAQABAAAAUtICWOZGmeKDCqIlu68AvMdO2ueHvGuslTN6Bt6MsBd8Zg77hsDW3FpRJFrYpCADs=';

    var fliph_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQs8MhJq704ZyC5Bh74hd7FhUVZnV1qdq27wgdQyFOJ3qoe472fDEQkFTXIZAQAOw==';

    var flipv_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQr8MhJq7UA3JqP3t7nbR0lTiXHZWx7gnCMui4GFHhevLO+w5kcz/aThYyWCAA7';

    var rotcw_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQ38MhJq734kGzJ5prnScD1jWRJfRoFqBNbAQXM0XZG13q556mDr0C0vSbDYtAlJBZf0KgwCuREAAA7';

    var rotccw_icon = 'data:image/gif;base64,R0lGODlhEAAQALMAAAAAAIAAAACAAICAAAAAgIAAgACAgMDAwICAgP8AAAD/AP//AAAA//8A/wD//////yH5BAEAAAcALAAAAAAQABAAAAQ38MhJq73YklzJzoDkjRcQit9HmZSqHkBxaqvMSbF95yFbFsAebDbJ2WY+GDAIq7BM0F40eqtEAAA7';

    var up_icon = 'data:image/x-icon;base64,AAABAAEAEBAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAAA/wAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAD/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/gACA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    var down_icon = 'data:image/x-icon;base64,AAABAAEAEBAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAAA/wAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAD/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/4AAgP+AAID/gACA/4AAgP+AAID/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAID/gACA/4AAgP+AAID/gACA/wAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/gACA/4AAgP+AAID/gACA/4AAgP8AAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    var ground_icon = 'data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA/v8AAP1/AAD7vwAA998AAO/vAADf9wAAwAcAAP7/AAD+/wAA/v8AAP7/AAD+/wAA/v8AAP7/AAD//wAA';

    var vdd_icon = 'data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD+/wAA/v8AAP7/AAD+/wAA/v8AAP7/AAD+/wAA/v8AAP7/AADABwAA//8AAP//AAD//wAA';

    var port_icon = 'data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD//wAAAH8AAH+/AAB/3wAAf+8AAH/wAAB/7wAAf98AAH+/AAAAfwAA//8AAP//AAD//wAA';

    var check_icon = 'data:image/gif;base64,R0lGODlhEAAQAPcAADHOMf///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////yH5BAEAAAEALAAAAAAQABAAAAg2AAMIHEiwoMGDAQAAQFhQ4UKGCR1CjPgQosSJFzFWbEhQIcKLHhlKDCkyY0mSFlGWnMiSYEAAADs=';


    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Interface to cktsim
    //
    //////////////////////////////////////////////////////////////////////////////

    // parse foo(1,2,3) into {type: foo, args: [1,2,3]}
    function parse_source(value) {
        var m = value.match(/(\w+)\s*\((.*?)\)\s*/);
        var args = $.map(m[2].split(','),parse_number);
        return {type: m[1], args: args};
    }

    // build extraction environment, ask diagram to give us flattened netlist
    function diagram_netlist(diagram) {
        // extract netlist and convert to form suitable for new cktsim.js
        // use modules in the schematics and analog libraries as the leafs
        var mlist = ['ground'];
        $.each(jade.libraries.analog.modules,function (mname,module) { mlist.push(module.get_name()); });
        return diagram.netlist(mlist);
    }

    // convert diagram netlist to cktsim format
    function cktsim_netlist(netlist) {
        // run through extracted netlist, updating device names, evaluating numeric
        // args and eliminating entries we don't care about
        var revised_netlist = [];
        $.each(netlist,function (index,device) {
            var type = device[0];
            var c = device[1];
            var props = device[2];
            if (type == 'analog:nfet')
                revised_netlist.push({type: 'nfet',
                                      connections: c,
                                      properties: {name: props.name, 
                                                   W: parse_number(props.W),
                                                   L: parse_number(props.L)}
                                     });
            else if (type == 'analog:pfet')
                revised_netlist.push({type: 'pfet',
                                      connections: c,
                                      properties: {name: props.name, 
                                                   W: parse_number(props.W),
                                                   L: parse_number(props.L)}
                                     });
            else if (type == 'analog:r')
                revised_netlist.push({type: 'resistor',
                                      connections: c,
                                      properties: {name: props.name, value: parse_number(props.r)}
                                     });
            else if (type == 'analog:l')
                revised_netlist.push({type: 'inductor',
                                      connections: c,
                                      properties: {name: props.name, value: parse_number(props.l)}
                                     });
            if (type == 'analog:c')                revised_netlist.push({type: 'capacitor',
                                      connections: c,
                                      properties: {name: props.name, value: parse_number(props.c)}
                                     });
            else if (type == 'analog:v')
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == 'analog:i')
                revised_netlist.push({type: 'current source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == 'analog:o')
                revised_netlist.push({type: 'opamp',
                                      connections: c,
                                      properties: {name: props.name, A: parse_number(props.A)}
                                     });
            else if (type == 'analog:d')
                revised_netlist.push({type: 'diode',
                                      connections: c,
                                      properties: {name: props.name, area: parse_number(props.area)}
                                     });
            else if (type == 'ground')   // ground connection
                revised_netlist.push({type: 'ground',
                                      connections: [c.gnd],
                                      properties: {}
                                     });
            else if (type == 'analog:a')   // current probe
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: {type: 'dc', args: [0]}}
                                     });
        });

        //console.log(JSON.stringify(netlist));
        //print_netlist(revised_netlist);

        return revised_netlist;
    }

    // return a list of nodes appearing in a cktsim netlist
    function extract_nodes(netlist) {
        var nodes = {};
        $.each(netlist,function(index,device){
            if (device.type != 'ground')
                for (var c in device.connections)
                    nodes[device.connections[c]] = null;  // add to dictionary
            else
                nodes[device.connections[0]] = null;
        });

        return Object.keys(nodes);
    }

    function print_netlist(netlist) {
        if (netlist.length > 0) {
            var clist = [];
            $.each(netlist,function (item,device) {
                clist.push(device.type + " (" + device.properties.name + "): " + JSON.stringify(device.connections) + " " + JSON.stringify(device.properties));
            });
            console.log(clist.join('\n'));
            console.log(clist.length.toString() + ' devices');
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  DC Analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    // extend connection points to display operating point voltage
    jade.ConnectionPoint.prototype.display_voltage = function(diagram, vmap) {
        var v = vmap[this.label];
        if (v !== undefined) {
            var label = v.toFixed(2) + 'V';

            // first draw some solid blocks in the background
            diagram.c.globalAlpha = 0.85;
            this.parent.draw_text(diagram, '\u2588\u2588\u2588', this.offset_x, this.offset_y,
                                  4, diagram.annotation_font, diagram.background_style);
            diagram.c.globalAlpha = 1.0;

            // display the node voltage at this connection point
            this.parent.draw_text(diagram, label, this.offset_x, this.offset_y,
                                  4, diagram.annotation_font, diagram.annotation_style);

            // only display each node voltage once
            delete vmap[this.label];
        }
    };

    // extend components to display operating point branch currents
    // default behavior: nothing to display for DC analysis
    jade.Component.prototype.display_current = function(diagram, vmap) {
        if (this.type == "analog:a") {
            // current probe
            var label = 'I(' + this.name + ')';
            var v = vmap[label];
            if (v !== undefined) {
                var i = engineering_notation(v, 2) + 'A';
                this.draw_text(diagram, i, 8, 5, 1, diagram.annotation_font, diagram.annotation_style);

                // only display each current once
                delete vmap[label];
            }
        }
    };

    // callback to annotate diagram with operating point results
    function display_dc(diagram, operating_point) {
        // make a copy of the operating_point info so we can mess with it
        var temp = {};
        for (var i in operating_point) {
            temp[i] = operating_point[i];
        }

        // run through connection points displaying (once) the voltage
        // for each electrical node
        var connection_points = diagram.aspect.connection_points;
        for (var location in connection_points) {
            (connection_points[location])[0].display_voltage(diagram, temp);
        }

        // let components display branch current info if available
        diagram.aspect.map_over_components(function(c) {
            c.display_current(diagram, temp);
            return false;
        });
    }

    // handler for DC analysis tool
    function dc_analysis(diagram) {
        // remove any previous annotations
        diagram.remove_annotations();

        var netlist = cktsim_netlist(diagram_netlist(diagram));

        if (netlist.length > 0) {
            var ckt;
            try {
                ckt = new cktsim.Circuit(netlist);
            }
            catch (e) {
                alert(e);
                return;
            }

            // run the analysis
            var operating_point;
            try {
                operating_point = ckt.dc();
            }
            catch (e) {
                alert("Error during DC analysis:\n\n" + e);
                return;
            }

            console.log('OP: '+JSON.stringify(operating_point));

            if (operating_point !== undefined) {
                // save a copy of the results for submission
                var dc = {};
                for (var i in operating_point) {
                    dc[i] = operating_point[i];
                }
                // add permanenty copy to module's properties
                diagram.aspect.module.set_property('dc_results', dc);

                // display results on diagram
                diagram.add_annotation(function(diagram) {
                    display_dc(diagram, operating_point);
                });
            }
        }
    }

    // add DC analysis to tool bar
    schematic_tools.push(['DC', 'DC', 'DC Analysis', dc_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  AC Analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    // return a list of [color,node_label,offset,type] for each probe in the netlist
    // type is 'voltage' or 'current'
    function find_probes(netlist) {
        var result = [];
        for (var i = netlist.length - 1; i >= 0; i -= 1) {
            var component = netlist[i];
            var type = component[0];
            var connections = component[1];
            var properties = component[2];
            var offset = properties.offset;
            if (offset === undefined || offset === '') offset = '0';
            if (type == 'analog:s') result.push([properties.color, connections.probe, offset, 'voltage']);
            else if (type == 'analog:a') result.push([properties.color, 'I(' + properties.name + ')', offset, 'current']);
        }
        return result;
    }

    // use a dialog to get AC analysis parameters
    function setup_ac_analysis(diagram) {
        diagram.remove_annotations();

        var fstart_lbl = 'Starting frequency (Hz)';
        var fstop_lbl = 'Ending frequency (Hz)';
        var source_name_lbl = 'Name of V or I source for ac';

        var netlist = diagram_netlist(diagram);

        if (find_probes(netlist).length === 0) {
            alert("AC Analysis: there are no voltage probes in the diagram!");
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        fields[fstart_lbl] = jade.build_input('text', 10, module.properties.ac_fstart || '10');
        fields[fstop_lbl] = jade.build_input('text', 10, module.properties.ac_fstop || '1G');
        fields[source_name_lbl] = jade.build_input('text', 10, module.properties.ac_source);

        var content = jade.build_table(fields);

        diagram.dialog('AC Analysis', content, function() {
            // retrieve parameters, remember for next time
            var ac_fstart = fields[fstart_lbl].value;
            var ac_fstop = fields[fstop_lbl].value;
            var ac_source = fields[source_name_lbl].value;

            module.set_property('ac_fstart', ac_fstart);
            module.set_property('ac_fstop', ac_fstop);
            module.set_property('ac_source', ac_source);

            ac_fstart = parse_number_alert(ac_fstart);
            ac_fstop = parse_number_alert(ac_fstop);
            if (ac_fstart === undefined || ac_fstop === undefined) return;

            ac_analysis(netlist, diagram, ac_fstart, ac_fstop, ac_source);
        });
    }

    // perform ac analysis
    function ac_analysis(netlist, diagram, fstart, fstop, ac_source_name) {
        var npts = 50;

        if (netlist.length > 0) {
            var ckt = new cktsim.Circuit(cktsim_netlist(netlist));
            var results;
            try {
                results = ckt.ac(npts, fstart, fstop, ac_source_name);
            }
            catch (e) {
                alert("Error during AC analysis:\n\n" + e);
                return;
            }

            if (typeof results == 'string') this.message(results);
            else {
                var x_values = results._frequencies_;
                var i,j,v;
                
                // x axis will be a log scale
                for (i = x_values.length - 1; i >= 0; i -= 1) {
                    x_values[i] = Math.log(x_values[i]) / Math.LN10;
                }

                // see what we need to submit.  Expecting attribute of the form
                // submit_analyses="{'tran':[[node_name,t1,t2,t3],...],
                //                   'ac':[[node_name,f1,f2,...],...]}"
                var submit = diagram.getAttribute('submit_analyses');
                if (submit && submit.indexOf('{') === 0) submit = JSON.parse(submit).ac;
                else submit = undefined;

                if (submit !== undefined) {
                    // save a copy of the results for submission
                    var ac_results = {};

                    // save requested values for each requested node
                    for (j = 0; j < submit.length; j += 1) {
                        var flist = submit[j]; // [node_name,f1,f2,...]
                        var node = flist[0];
                        var values = results[node];
                        var fvlist = [];
                        // for each requested freq, interpolate response value
                        for (var k = 1; k < flist.length; k += 1) {
                            var f = flist[k];
                            v = interpolate(f, x_values, values);
                            // convert to dB
                            fvlist.push([f, v === undefined ? 'undefined' : 20.0 * Math.log(v) / Math.LN10]);
                        }
                        // save results as list of [f,response] paris
                        ac_results[node] = fvlist;
                    }

                    diagram.aspect.module.set_property('ac_result', ac_results);
                }

                // set up plot values for each node with a probe
                var y_values = []; // list of [color, result_array]
                var z_values = []; // list of [color, result_array]
                var probes = find_probes(netlist);

                var probe_maxv = [];
                var probe_color = [];
                var label,color,offset;

                // Check for probe with near zero transfer function and warn
                for (i = probes.length - 1; i >= 0; i -= 1) {
                    if (probes[i][3] != 'voltage') continue;
                    probe_color[i] = probes[i][0];
                    label = probes[i][1];
                    v = results[label].magnitude;
                    probe_maxv[i] = array_max(v); // magnitudes always > 0
                }
                var all_max = array_max(probe_maxv);

                if (all_max < 1.0e-16) {
                    alert('Zero ac response, -infinity on DB scale.');
                }
                else {
                    for (i = probes.length - 1; i >= 0; i -= 1) {
                        if (probes[i][3] != 'voltage') continue;
                        if ((probe_maxv[i] / all_max) < 1.0e-10) {
                            alert('Near zero ac response, remove ' + probe_color[i] + ' probe');
                            return;
                        }
                    }
                }

                var dataseries = [];
                for (i = probes.length - 1; i >= 0; i -= 1) {
                    if (probes[i][3] != 'voltage') continue;
                    color = probes[i][0];
                    label = probes[i][1];
                    offset = parse_number(probes[i][2]);

                    v = results[label].magnitude;
                    // convert values into dB relative to source amplitude
                    var v_max = 1;
                    for (j = v.length - 1; j >= 0; j -= 1) {
                        // convert each value to dB relative to max
                        v[j] = 20.0 * Math.log(v[j] / v_max) / Math.LN10;
                    }
                    // magnitude
                    dataseries.push({xvalues: x_values,
                                     yvalues: v,
                                     name: label,
                                     color: color,
                                     offset: offset,
                                     //xlabel: 'log(Frequency in Hz)',
                                     ylabel: 'Magnitude',
                                     yunits: 'dB'
                                    });
                    // phase
                    dataseries.push({xvalues: x_values,
                                     yvalues: results[label].phase,
                                     name: label,
                                     color: color,
                                     offset: offset,
                                     xlabel: 'log(Frequency in Hz)',
                                     ylabel: 'Phase',
                                     yunits: '\u00B0'    // degrees
                                    });
                }

                // graph the result and display in a window
                var graph = plot.graph(dataseries);
                diagram.window('Results of AC Analysis', graph);
            }
        }
    }

    // t is the time at which we want a value
    // times is a list of timepoints from the simulation
    function interpolate(t, times, values) {
        if (values === undefined) return undefined;

        for (var i = 0; i < times.length; i += 1) {
            if (t < times[i]) {
                // t falls between times[i-1] and times[i]
                var t1 = (i === 0) ? times[0] : times[i - 1];
                var t2 = times[i];

                if (t2 === undefined) return undefined;

                var v1 = (i === 0) ? values[0] : values[i - 1];
                var v2 = values[i];
                var v = v1;
                if (t != t1) v += (t - t1) * (v2 - v1) / (t2 - t1);
                return v;
            }
        }
        return undefined;
    }

    function array_max(a) {
        var max = -Infinity;
        for (var i = a.length - 1; i >= 0; i -= 1) {
            if (a[i] > max) max = a[i];
        }
        return max;
    }

    // add AC analysis to tool bar
    schematic_tools.push(['AC', 'AC', 'AC Analysis', setup_ac_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Transient Analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    function setup_transient_analysis(diagram) {
        diagram.remove_annotations();

        var tstop_lbl = 'Stop Time (seconds)';

        // use modules in the analog library as the leafs
        var mlist = ['ground'];
        $.each(jade.libraries.analog.modules,function (mname,module) { mlist.push(module.get_name()); });
        var netlist = diagram.netlist(mlist);

        if (find_probes(netlist).length === 0) {
            alert("Transient Analysis: there are no probes in the diagram!");
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        fields[tstop_lbl] = jade.build_input('text', 10, module.properties.tran_tstop);

        var content = jade.build_table(fields);

        diagram.dialog('Transient Analysis', content, function() {
            // retrieve parameters, remember for next time
            module.set_property('tran_tstop', fields[tstop_lbl].value);
            var tstop = jade.parse_number_alert(module.properties.tran_tstop);

            if (netlist.length > 0 && tstop !== undefined) {
                var ckt = new cktsim.Circuit();
                if (!ckt.load_netlist(netlist)) return;

                // gather a list of nodes that are being probed.  These
                // will be added to the list of nodes checked during the
                // LTE calculations in transient analysis
                var probes = find_probes(netlist);
                var probe_names = {};
                for (var i = probes.length - 1; i >= 0; i -= 1) {
                    probe_names[i] = probes[i][1];
                }

                var progress = document.createElement('div');
                progress.className = 'jade-progress';

                // set up progress bar
                var d = document.createElement('div');
                d.className = 'jade-progress-wrapper';
                progress.appendChild(d);
                progress.bar = document.createElement('div');
                progress.bar.className = 'jade-progress-bar';
                $(progress.bar).width('0%');
                d.appendChild(progress.bar);

                // allow user to stop simulation
                var stop = jade.build_button('Stop', function(event) {
                    event.target.progress.stop_requested = true;
                });
                stop.progress = progress;
                progress.appendChild(stop);

                progress.update_interval = 250; // ms between progress bar updates
                progress.stop_requested = false;
                progress.finish = transient_results; // what to do when done!
                progress.probes = probes; // stash other useful info...
                progress.probe_names = probe_names;

                diagram.window('Progress', progress); // display progress bar

                // continue after a word from our sponsor
                setTimeout(function() {
                    ckt.tran_start(progress, 100, 0, tstop);
                }, 1);
            }
        });
    }

    // process results of transient analysis
    function transient_results(results, progress) {
        var diagram = progress.win.diagram;
        var probes = progress.probes;
        var v;

        jade.window_close(progress.win); // all done with progress bar

        if (typeof results == 'string') alert("Error during Transient analysis:\n\n" + results);
        else if (results === undefined) alert("Sorry, no results from transient analysis to plot!");
        else {
            var xvalues = results._time_;

            // see what we need to submit.  Expecting attribute of the form
            // submit_analyses="{'tran':[[node_name,t1,t2,t3],...],
            //                   'ac':[[node_name,f1,f2,...],...]}"
            var submit = diagram.getAttribute('submit_analyses');
            if (submit && submit.indexOf('{') === 0) submit = JSON.parse(submit).tran;
            else submit = undefined;

            if (submit !== undefined) {
                // save a copy of the results for submission
                var tran_results = {};

                // save requested values for each requested node
                for (var j = 0; j < submit.length; j += 1) {
                    var tlist = submit[j]; // [node_name,t1,t2,...]
                    var node = tlist[0];
                    var values = results[node];
                    var tvlist = [];
                    // for each requested time, interpolate waveform value
                    for (var k = 1; k < tlist.length; k += 1) {
                        var t = tlist[k];
                        v = interpolate(t, xvalues, values);
                        tvlist.push([t, v === undefined ? 'undefined' : v]);
                    }
                    // save results as list of [t,value] pairs
                    tran_results[node] = tvlist;
                }

                diagram.aspect.module.set_property('tran_result', tran_results);
            }

            // for plots see if there's some other x-axis
            var i;
            var xunits = 's';  // default x-axis is time
            var xlabel;
            for (i = probes.length - 1; i >= 0; i -= 1) {
                if (probes[i][0] == 'color') {
                    xvalues = results[probes[i][1]];
                    xunits = (probes[i][3] == 'voltage') ? 'V' : 'A';
                    xlabel = probes[i][1];
                    break;
                }
            }

            // set up plot values for each node with a probe
            var dataseries = [];
            for (var i = probes.length - 1; i >= 0; i -= 1) {
                var color = probes[i][0];
                var label = probes[i][1];
                var offset = parse_number(probes[i][2]);
                v = results[label];
                if (v === undefined) {
                    alert('The ' + color + ' probe is connected to node ' + '"' + label + '"' + ' which is not an actual circuit node');
                } else if (color != 'x-axis') {
                    dataseries.push({xvalues: xvalues,
                                     yvalues: v,
                                     name: label,
                                     color: color,
                                     xunits: xunits,
                                     yunits: (probes[i][3] == 'voltage') ? 'V' : 'A',
                                     offset: offset
                                    });
                }
            }

            // graph the result and display in a window
            var graph = plot.graph(dataseries);
            diagram.window('Results of Transient Analysis', graph);
        }
    }


    // add transient analysis to tool bar
    schematic_tools.push(['tran', 'TRAN', 'Transient Analysis', setup_transient_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    var exports = {};
    exports.schematic_tools = schematic_tools;
    exports.print_netlist = print_netlist;
    exports.icon_tools = icon_tools;
    exports.parse_number = parse_number; // make it easy to call from outside
    exports.parse_number_alert = parse_number_alert; // make it easy to call from outside
    exports.engineering_notation = engineering_notation;
    exports.parse_source = parse_source;
    return exports;
}());

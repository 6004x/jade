// Copyright (C) 2011-2014 Massachusetts Institute of Technology
// Chris Terman

// keep jslint happy
//var console,JSON;
//var $,jade,cktsim,plot;

jade.schematic_view = (function() {
    //////////////////////////////////////////////////////////////////////
    //
    // Schematic editor
    //
    //////////////////////////////////////////////////////////////////////

    var schematic_tools = [];

    function Schematic(div, parent) {
        this.jade = parent;
        this.status = parent.status;

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
        $(this.diagram.canvas)
            .mousemove(schematic_mouse_move)
            .mouseover(schematic_mouse_enter)
            .mouseout(schematic_mouse_leave)
            .mouseup(schematic_mouse_up)
            .mousedown(schematic_mouse_down)
            .dblclick(schematic_double_click)
            .keydown(schematic_key_down);

        this.toolbar = new jade.Toolbar(this.diagram);

        this.toolbar.add_tool('actions', jade.icons.actions_icon,
                              'Create/rename/delete modules; change settings', jade.jade_settings);
        this.toolbar.add_spacer();

        this.toolbar.add_tool('undo', jade.icons.undo_icon,
                              'Undo: undo effect of previous action', jade.diagram_undo,
                              function(diagram) {
                                  return diagram.aspect && diagram.aspect.can_undo();
                              });
        this.toolbar.add_tool('redo', jade.icons.redo_icon,
                              'redo: redo effect of next action', jade.diagram_redo,
                              function(diagram) {
                                  return diagram.aspect && diagram.aspect.can_redo();
                              });

        function has_selections(diagram) {
            return diagram.aspect && !diagram.aspect.read_only() && diagram.aspect.selections();
        }
        
        this.toolbar.add_tool('cut', jade.icons.cut_icon,
                              'Cut: move selected components from diagram to the clipboard',
                              jade.diagram_cut, has_selections);
        this.toolbar.add_tool('copy', jade.icons.copy_icon,
                              'Copy: copy selected components into the clipboard',
                              jade.diagram_copy, has_selections);
        this.toolbar.add_tool('paste', jade.icons.paste_icon,
                              'Paste: copy clipboard into the diagram', jade.diagram_paste,
                              function(diagram) {
                                  return diagram.aspect && !diagram.aspect.read_only() &&
                                         jade.clipboards[diagram.editor.editor_name].length > 0;
                              });
        this.toolbar.add_tool('fliph', jade.icons.fliph_icon,
                              'Flip Horizontally: flip selection horizontally',
                              jade.diagram_fliph, has_selections);
        this.toolbar.add_tool('flipv', jade.icons.flipv_icon,
                              'Flip Vertically: flip selection vertically',
                              jade.diagram_flipv, has_selections);
        this.toolbar.add_tool('rotcw', jade.icons.rotcw_icon,
                              'Rotate Clockwise: rotate selection clockwise',
                              jade.diagram_rotcw, has_selections);
        this.toolbar.add_tool('rotccw', jade.icons.rotccw_icon,
                              'Rotate Counterclockwise: rotate selection counterclockwise',
                              jade.diagram_rotccw, has_selections);
        this.toolbar.add_spacer();

        // are we supporting hierarchy?
        this.hierarchy = parent.configuration.hierarchical;
        if (this.hierarchy) {
            this.toolbar.add_tool('down', jade.icons.down_icon,
                                  'Down in the hierarchy: view selected included module', schematic_down,
                                  function(diagram) {
                                      if (!diagram.aspect) return false;
                                      var selected = diagram.aspect.selected_component();
                                      if (selected !== undefined) return selected.has_aspect(Schematic.prototype.editor_name);
                                      else return false;
                                  });
            this.toolbar.add_tool('up', jade.icons.up_icon,
                                  'Up in the hierarchy: return to including module', schematic_up,
                                  function(diagram) {
                                      return diagram.editor && diagram.editor.hierarchy_stack.length > 0;
                                  });
            this.toolbar.add_spacer();
        }

        function insert_part_allowed() {
            return this.diagram && this.diagram.aspect && !this.diagram.aspect.read_only(); 
        };

        var part = this.toolbar.add_tool('ground', jade.icons.ground_icon,
                                         'Ground connection: click and drag to insert', null,
                                         insert_part_allowed);
        part_tool(part,this,'ground');

        part = this.toolbar.add_tool('vdd', jade.icons.vdd_icon,
                                     'Power supply connection: click and drag to insert', null,
                                     insert_part_allowed);
        part_tool(part,this,'vdd');

        part = this.toolbar.add_tool('port', jade.icons.port_icon,
                                     'I/O Port: click and drag to insert', null, 
                                     insert_part_allowed);
        part_tool(part,this,'port');

        part = this.toolbar.add_tool('jumper', jade.icons.jumper_icon,
                                     'Jumper for connecting wires with different names: click and drag to insert', null,
                                     insert_part_allowed);
        part_tool(part,this,'jumper');

        part = this.toolbar.add_tool('text', jade.icons.text_icon,
                                     'Text: click and drag to insert', null, 
                                     insert_part_allowed);
        part_tool(part,this,'text');

        this.toolbar.add_spacer();

        // add external tools
        var tools = parent.configuration.tools;
        if (tools !== undefined) tools = tools.split(',');
        for (var i = 0; i < schematic_tools.length; i += 1) {
            var info = schematic_tools[i]; // [name,icon,tip,callback,enable_check]
            if (tools !== undefined && $.inArray(info[0],tools) == -1)
                continue;  // skip tool if it's not on the list
            this.toolbar.add_tool(info[0], info[1], info[2], info[3], info[4]);
        }

        div.appendChild(this.toolbar.toolbar[0]);

        div.appendChild(this.diagram.canvas);
        var aspect = new jade.model.Aspect('untitled', null);
        this.diagram.set_aspect(aspect);

        // set up parts bin
        this.parts_bin = new PartsBin(this,parent.configuration.parts);
        div.appendChild(this.parts_bin.top_level);

        // set up resizer
        this.resizer = $('<div class="jade-xparts-resize"></div>');
        var sch = this;
        var lastX, lastY;
        this.resizer.on('mousedown',function (event) {
            lastX = event.pageX;
            lastY = event.pageY;

            function move(e) {
                var event = window.event || e;
                var dx = event.pageX - lastX;
                var parts = $(sch.parts_bin.top_level);
                var sch_canvas = $(sch.diagram.canvas);
                var w;

                if (dx >= 0) {
                    // min size for parts bin is 75
                    w = parts.width() - dx;
                    if (w < 75) dx -= 75 - w;
                } else {
                    // min size for schematic is 300
                    w = sch_canvas.width() + dx;
                    if (w < 300) dx += 300 - w;
                }

                parts.width(parts.width() - dx);
                sch_canvas.width(sch_canvas.width() + dx);
                sch_canvas[0].diagram.resize();

                lastX = event.pageX;
                lastY = event.pageY;
                return false;
            }

            function up() {
                var doc = $(document).get(0);
                doc.removeEventListener('mousemove',move,true);
                doc.removeEventListener('mouseup',up,true);
                return false;
            }

            $(document).get(0).addEventListener('mousemove',move,true);
            $(document).get(0).addEventListener('mouseup',up,true);

            return false;
        });

        div.appendChild(this.resizer[0]);
    }

    function part_tool(tool,editor,pname) {
        tool.off('click');   // different gesture for this tool
        var part = new Part(editor);
        part.set_component(jade.model.make_component([pname,[0,0,0],{}]));
        tool.mousedown(function(event) { editor.diagram.new_part = part; });
        tool.mouseup(function(event) { editor.diagram.new_part = undefined; });
    }

    Schematic.prototype.diagram_changed = function(diagram) {
        var module = diagram.aspect.module;
        if (module) {
            var tests = this.jade.configuration.tests;
            delete tests[module.get_name()];
        }
    };

    Schematic.prototype.resize = function(w, h, selected) {
        // schematic canvas
        var e = $(this.diagram.canvas);

        var w_extra = e.outerWidth(true) - e.width();
        var h_extra = e.outerHeight(true) - e.height();
        var w_parts = this.resizer.outerWidth(true) + $(this.parts_bin.top_level).outerWidth(true);
        var h_toolbar = this.toolbar.toolbar.outerHeight(true);
        
        var tw = w -  w_extra;
        var th = h - h_extra - h_toolbar;
        e.width(tw - w_parts);
        e.height(th);

        e = this.resizer;
        e.height(th);

        this.parts_bin.resize(tw, th, selected);

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
        if (this.toolbar) this.toolbar.enable_tools(this.diagram);

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
        if (!diagram.aspect.read_only() && diagram.new_part) {
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
            diagram.event_coords(event);  // set up cursor coords based on new grid
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
        if (!diagram.aspect.read_only() && dx <= jade.model.connection_point_radius && dy <= jade.model.connection_point_radius && cplist && !event.shiftKey) {
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

        if (diagram.aspect && !diagram.aspect.read_only()) {
            // see if we double-clicked a component.  If so, edit it's properties
            diagram.aspect.map_over_components(function(c) {
                if (c.edit_properties(diagram, diagram.aspect_x, diagram.aspect_y)) return true;
                return false;
            });
        }

        event.preventDefault();
        return false;
    }

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Built-in schematic components
    //
    ////////////////////////////////////////////////////////////////////////////////

    function Wire(json) {
        jade.model.Component.call(this);
        this.module = wire_module; // set up properties for this component
        this.load(json);
    }
    Wire.prototype = new jade.model.Component();
    Wire.prototype.constructor = Wire;
    jade.model.built_in_components.wire = Wire;
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
        jade.model.canonicalize(r);
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
        jade.model.Component.prototype.move_end.call(this);

        // look for connection points that might bisect us
        this.aspect.check_connection_points(this);
    };

    Wire.prototype.add = function(aspect) {
        jade.model.Component.prototype.add.call(this, aspect);

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
                jade.model.Component.prototype.remove.call(w);
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
        jade.model.Component.call(this);
        this.module = ground_module; // set up properties for this component
        this.load(json);
    }
    Ground.prototype = new jade.model.Component();
    Ground.prototype.constructor = Ground;
    jade.model.built_in_components.ground = Ground;
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
        jade.model.Component.call(this);
        this.module = vdd_module; // set up properties for this component
        this.load(json);
    }
    Vdd.prototype = new jade.model.Component();
    Vdd.prototype.constructor = Vdd;
    jade.model.built_in_components.vdd = Vdd;
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

    // Jumper

    function Jumper(json) {
        jade.model.Component.call(this);
        this.module = jumper_module; // set up properties for this component
        this.load(json);
    }
    Jumper.prototype = new jade.model.Component();
    Jumper.prototype.constructor = Jumper;
    jade.model.built_in_components.jumper = Jumper;
    var jumper_module = {
        has_aspect: function () {return false;}
    };

    Jumper.prototype.load = function(json) {
        this.type = json[0];
        this.coords = json[1];
        this.properties = json[2] || {};   // not expecting any properties...
        this.default_properties(); // add any missing properties
        this.add_connection(0, 0, "n1");
        this.add_connection(8, 0, "n2");

        // compute bounding box (expanded slightly)
        var r = [0, -4, 8, 0];
        this.bounding_box = r;
        this.update_coords(); // update bbox
    };

    Jumper.prototype.draw = function(diagram) {
        this.draw_arc(diagram, 0,0, 8,0, 4,-4);  // a "bump" to distinguish jumper from wire
    };

    // I/O port

    function Port(json) {
        jade.model.Component.call(this);
        this.module = port_module; // set up properties for this component
        this.load(json);
    }
    Port.prototype = new jade.model.Component();
    Port.prototype.constructor = Port;
    jade.model.built_in_components.port = Port;
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

    // text, aligned around reference point

    var text_alignments = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];

    // crude estimate of bbox for aligned text
    var text_canvas = $('<canvas></canvas>');
    function text_bbox(text, align, font) {
        var ctx = text_canvas[0].getContext('2d');
        if (font) {
            text_canvas.css('font',font);
            ctx.font = font;
        }
        var w = ctx.measureText(text).width;

        var font_size = text_canvas.css('font-size').match(/([\d\.]*)(\w*)/);
        var h = parseFloat(font_size[1]);
        // pt = 0.75*px, em = pt/12
        if (font_size[2] == 'em') h *= 16;   // px = 16*em
        else if (font_size[2] == 'pt') h *= 4/3;  // px = (4/3)*pt

        //var h = 8;
        //var w = 4 * (text ? text.length : 0);

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

    function Text(json) {
        jade.model.Component.call(this);
        this.module = text_module;
        this.load(json);
    }
    Text.prototype = new jade.model.Component();
    Text.prototype.constructor = Text;
    Text.prototype.required_grid = 1;
    jade.model.built_in_components.text = Text;
    var text_module = {
        has_aspect: function () {return false;},
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

        this.bounding_box = text_bbox(this.properties.text, this.properties.align, this.properties.font);
        this.update_coords();
    };

    Text.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Text.prototype.draw = function(diagram) {
        if (this.selected) {
            // "+" marks the reference point for the property
            this.draw_line(diagram, - 1, 0, 1, 0);
            this.draw_line(diagram, 0, - 1, 0, 1);
        }

        var align = text_alignments.indexOf(this.properties.align);
        this.draw_text(diagram, this.properties.text, 0, 0, align, this.properties.font);
    };

    Text.prototype.draw_icon = function(c, diagram) {
        // need to adjust alignment accounting for our rotation
        var align = text_alignments.indexOf(this.properties.align);
        align = jade.model.aOrient[this.coords[2] * 9 + align];

        c.draw_text(diagram, this.properties.text, this.coords[0], this.coords[1], align, this.properties.font);
    };

    Text.prototype.edit_properties = function(diagram, x, y) {
        return jade.model.Component.prototype.edit_properties.call(this, diagram, x, y, function(c) {
            c.bounding_box = text_bbox(c.properties.text, c.properties.align);
            c.update_coords();
        });
    };

    Text.prototype.netlist = function(prefix) {
        return undefined;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Parts bin
    //
    ////////////////////////////////////////////////////////////////////////////////

    var part_w = 42; // size of a parts bin compartment
    var part_h = 42;

    function PartsBin(editor,parts_wanted) {
        this.editor = editor;
        this.diagram = editor.diagram;
        this.components = editor.components;
        this.parts_wanted = parts_wanted;

        var bin = $('<div class="jade-xparts-bin"></div>');
        this.top_level = bin[0];
        this.top_level.parts_bin = this;

        this.parts = {}; // lib:module => Part
    }

    PartsBin.prototype.resize = function(w, h, selected) {
        var e = $(this.top_level);
        e.height(h);
    };

    PartsBin.prototype.show = function() {
        var parts_bin = this;
        var bin = $(this.top_level);
        bin.empty();
 
        if (this.parts_wanted) {
            // figure out all the parts to appear in parts bin
            var plist = [];
            $.each((this.parts_wanted || '').split(','),function (index,p) {
                var part = p.split(':');   // split into lib and module
                var lib = part[0];
                var mpattern = new RegExp(part[1] ? '^'+part[1]+'$' : '^.+$');
                jade.model.load_library(lib);   // load reference library
                // add all matching modules in library to parts list
                $.each(jade.model.libraries[lib].modules,function (mname, m) {
                    if (mpattern.test(mname)) plist.push(m.get_name());
                });
            });
            plist.sort();   // arrange alphabetically

            var current = '';
            var header,parts_list;
            $.each(plist,function (index,p) {
                // check cache, create Part if new module
                var part = parts_bin.parts[p];
                if (part === undefined) {
                    part = new Part(parts_bin.editor);
                    parts_bin.parts[p] = part;
                    part.set_component(jade.model.make_component([p, [0, 0, 0]]));
                }
                // incorporate any recent edits to the icon
                part.component.compute_bbox();
                part.rescale();
                part.redraw();

                // add handlers here since any old handlers were
                // removed if part was removed from parts_list
                // at some earlier point
                part.canvas
                    .mouseover(part_enter)
                    .mouseout(part_leave)
                    .mousedown(part_mouse_down)
                    .mouseup(part_mouse_up)
                    .dblclick(part_dblclick);

                // add icon to parts bin along with new header if needed
                var lname = part.component.module.library.name;
                if (current != lname) {
                    header = $('<div class="jade-xparts-header"></div>').text(lname).attr('id',lname);
                    parts_list =  $('<div class="jade-xparts-list"></div>').attr('id',lname+'-parts');
                    current = lname;
                    bin.append(header,parts_list);
                }
                parts_list.append(part.canvas);
            });
        }

        // bug?  nudge DOM's redraw so it will actually dispaly the newly added part
        // without this, sometimes the parts contents aren't shown ?!
        bin.width(bin.width()-1);
        bin.width(bin.width()+1);
    };

    // one instance will be created for each part in the parts bin
    function Part(editor) {
        this.editor = editor;
        this.diagram = editor.diagram;
        this.component = undefined;
        this.selected = false;

        // set up canvas
        this.canvas = $('<canvas class="jade-xpart jade-tool jade-tool-enabled"></div>'); //.css('cursor','default');
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
        tip += ': drag onto diagram to insert, double click to edit';

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

    function part_dblclick(event) {
        var part = event.target.part;
        part.editor.jade.edit(part.component.module.get_name());
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Interface to cktsim
    //
    //////////////////////////////////////////////////////////////////////////////

    // parse foo(1,2,3) into {type: foo, args: [1,2,3]}
    function parse_source(value) {
        var m = value.match(/(\w+)\s*\((.*?)\)\s*/);
        var args = $.map(m[2].split(','),jade.utils.parse_number);
        return {type: m[1], args: args};
    }

    // build extraction environment, ask diagram to give us flattened netlist
    function diagram_netlist(diagram) {
        // extract netlist and convert to form suitable for new cktsim.js
        // use modules in the analog libraries as the leafs
        var mlist = ['ground','jumper'];
        if (jade.model.libraries.analog !== undefined)
            $.each(jade.model.libraries.analog.modules,function (mname,module) { mlist.push(module.get_name()); });
        return cktsim_netlist(diagram.netlist(mlist));
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
                                                   W: jade.utils.parse_number(props.W),
                                                   L: jade.utils.parse_number(props.L)}
                                     });
            else if (type == 'analog:pfet')
                revised_netlist.push({type: 'pfet',
                                      connections: c,
                                      properties: {name: props.name, 
                                                   W: jade.utils.parse_number(props.W),
                                                   L: jade.utils.parse_number(props.L)}
                                     });
            else if (type == 'analog:r')
                revised_netlist.push({type: 'resistor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.r)}
                                     });
            else if (type == 'analog:l')
                revised_netlist.push({type: 'inductor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.l)}
                                     });
            if (type == 'analog:c')                revised_netlist.push({type: 'capacitor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.c)}
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
                                      properties: {name: props.name, A: jade.utils.parse_number(props.A)}
                                     });
            else if (type == 'analog:d')
                revised_netlist.push({type: 'diode',
                                      connections: c,
                                      properties: {name: props.name, area: jade.utils.parse_number(props.area)}
                                     });
            else if (type == 'ground')   // ground connection
                revised_netlist.push({type: 'ground',
                                      connections: [c.gnd],
                                      properties: {}
                                     });
            else if (type == 'jumper') {  // jumper connection
                var clist = [];
                $.each(c,function (name,node) { clist.push(node); });
                revised_netlist.push({type: 'connect',
                                      connections: clist,
                                      properties: {}
                                     });
            }
            else if (type == 'analog:s')   // ground connection
                revised_netlist.push({type: 'voltage probe',
                                      connections: c,
                                      properties: {name: props.name, color: props.color, offset: jade.utils.parse_number(props.offset)}
                                     });
            else if (type == 'analog:a')   // current probe
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: {type: 'dc', args: [0]}}
                                     });
            else if (type == 'analog:iv') // initial voltage
                revised_netlist.push({type: 'initial voltage',
                                      connections: c,
                                      properties: {name: props.name, IV: jade.utils.parse_number(props.IV)}
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
    jade.model.ConnectionPoint.prototype.display_voltage = function(diagram, vmap) {
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
    jade.model.Component.prototype.display_current = function(diagram, vmap) {
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

        var netlist = diagram_netlist(diagram);

        if (netlist.length > 0) {
            var ckt;
            try {
                ckt = new cktsim.Circuit(netlist);
            }
            catch (e) {
                diagram.message(e);
                return;
            }

            // run the analysis
            var operating_point;
            try {
                operating_point = ckt.dc(true);
            }
            catch (e) {
                diagram.message("Error during DC analysis:\n\n" + e);
                return;
            }

            //console.log('OP: '+JSON.stringify(operating_point));

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
            var type = component.type;
            var connections = component.connections;
            var properties = component.properties;
            var offset = properties.offset;
            if (offset === undefined || offset === '') offset = '0';
            if (type == 'voltage probe') {
                result.push([properties.color, connections.probe, offset, 'voltage']);
            } else if (type == 'voltage source' &&
                     properties.value.type == 'dc' &&
                     properties.value.args.length == 1 &&
                     properties.value.args[0] === 0)
                result.push([properties.color, 'I(' + properties.name + ')', offset, 'current']);
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
            diagram.message("AC Analysis: there are no voltage probes in the diagram!");
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

            ac_fstart = jade.utils.parse_number_alert(ac_fstart);
            ac_fstop = jade.utils.parse_number_alert(ac_fstop);
            if (ac_fstart === undefined || ac_fstop === undefined) return;

            ac_analysis(netlist, diagram, ac_fstart, ac_fstop, ac_source);
        });
    }

    // perform ac analysis
    function ac_analysis(netlist, diagram, fstart, fstop, ac_source_name) {
        var npts = 50;

        if (netlist.length > 0) {
            var ckt = new cktsim.Circuit(netlist);
            var results;
            try {
                results = ckt.ac(npts, fstart, fstop, ac_source_name);
            }
            catch (e) {
                diagram.message("Error during AC analysis:\n\n" + e);
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
                    diagram.message('Zero ac response, -infinity on DB scale.');
                }
                else {
                    for (i = probes.length - 1; i >= 0; i -= 1) {
                        if (probes[i][3] != 'voltage') continue;
                        if ((probe_maxv[i] / all_max) < 1.0e-10) {
                            diagram.message('Near zero ac response, remove ' + probe_color[i] + ' probe');
                            return;
                        }
                    }
                }

                var dataseries = [];
                for (i = probes.length - 1; i >= 0; i -= 1) {
                    if (probes[i][3] != 'voltage') continue;
                    color = probes[i][0];
                    label = probes[i][1];
                    offset = probes[i][2];

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

    // build simple progress bar with stop button
    function tran_progress_report() {
        var progress = $('<div class="jade-progress"><div class="jade-progress-wrapper"><div class="jade-progress-bar" style="width:0%"></div></div><button id="stop">Stop</button></div>');
        var stop = progress.find('#stop');
        stop.on('click',function(event) {
            event.target.progress.stop_requested = true;
        });
        stop[0].progress = progress[0];
        return progress;
    }

    function setup_transient_analysis(diagram) {
        diagram.remove_annotations();

        var tstop_lbl = 'Stop Time (seconds)';

        // use modules in the analog library as the leafs
        var netlist = diagram_netlist(diagram);

        if (find_probes(netlist).length === 0) {
            diagram.message("Transient Analysis: there are no probes in the diagram!");
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        fields[tstop_lbl] = jade.build_input('text', 10, module.properties.tran_tstop);

        var content = jade.build_table(fields);

        diagram.dialog('Transient Analysis', content, function() {
            // retrieve parameters, remember for next time
            module.set_property('tran_tstop', fields[tstop_lbl].value);
            var tstop = jade.utils.parse_number_alert(module.properties.tran_tstop);

            if (netlist.length > 0 && tstop !== undefined) {
                // gather a list of nodes that are being probed.  These
                // will be added to the list of nodes checked during the
                // LTE calculations in transient analysis
                var probes = find_probes(netlist);
                var probe_names = {};
                for (var i = probes.length - 1; i >= 0; i -= 1) {
                    probe_names[i] = probes[i][1];
                }

                var progress = tran_progress_report();
                diagram.window('Progress', progress); // display progress bar

                cktsim.transient_analysis(netlist,tstop,probe_names,function(percent_complete,results) {
                    if (results === undefined) {
                        progress.find('.jade-progress-bar').css('width',percent_complete+'%');
                        return progress[0].stop_requested;
                    } else {
                        jade.window_close(progress.win); // all done with progress bar
                        transient_results(results,diagram,probes);
                    }
                });
            }
        });
    }

    // process results of transient analysis
    function transient_results(results,diagram,probes) {
        var v;

        if (typeof results == 'string') diagram.message("Error during Transient analysis:\n\n" + results);
        else if (results === undefined) diagram.message("Sorry, no results from transient analysis to plot!");
        else {
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

            // set up plot values for each node with a probe
            var dataseries = [];
            for (var i = probes.length - 1; i >= 0; i -= 1) {
                var color = probes[i][0];
                var label = probes[i][1];
                v = results[label];
                if (v === undefined) {
                    diagram.message('The ' + color + ' probe is connected to node ' + '"' + label + '"' + ' which is not an actual circuit node');
                } else if (color != 'x-axis') {
                    dataseries.push({xvalues: v.xvalues,
                                     yvalues: v.yvalues,
                                     name: label,
                                     color: color,
                                     xunits: 's',
                                     yunits: (probes[i][3] == 'voltage') ? 'V' : 'A',
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

    return {
        schematic_tools: schematic_tools,
        text_alignments: text_alignments,
        text_bbox: text_bbox,
        print_netlist: print_netlist,
        cktsim_netlist: cktsim_netlist,
        extract_nodes: extract_nodes,
        tran_progress_report: tran_progress_report,
        interpolate: interpolate
    };

}());

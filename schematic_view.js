// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.schematic_view = function(jade) {
    //////////////////////////////////////////////////////////////////////
    //
    // Schematic editor
    //
    //////////////////////////////////////////////////////////////////////

    var schematic_tools = [];

    function Schematic(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.tab = div.tab;

        var options = {};
        this.options = options;
        if (parent.configuration.options) {
            $.each(parent.configuration.options,function (n,vstring) {
                var v = jade.utils.parse_number(vstring);
                if (!isNaN(v)) options[n] = v;
            });
        }

        this.diagram = new jade.Diagram(this, 'jade-schematic-diagram');
        div.diagram = this.diagram;
        this.diagram.wire = undefined;
        this.diagram.new_part = undefined;

        this.diagram.grid = 8;
        this.diagram.zoom_factor = 1.25; // scaling is some power of zoom_factor
        this.diagram.zoom_min = Math.pow(this.diagram.zoom_factor, - 3);
        this.diagram.zoom_max = Math.pow(this.diagram.zoom_factor, 9);
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

        if (!parent.configuration.readonly) {
            this.toolbar.add_tool('grid', jade.icons.grid_icon,
                                  'Toggle schematic grid', jade.diagram_toggle_grid);
            this.toolbar.add_spacer();

            this.toolbar.add_tool('undo', jade.icons.undo_icon,
                                  'Undo: undo effect of previous action (\u2318Z, ctrl-Z)', jade.diagram_undo,
                                  function(diagram) {
                                      return diagram.aspect && diagram.aspect.can_undo();
                                  });
            this.toolbar.add_tool('redo', jade.icons.redo_icon,
                                  'redo: redo effect of next action (\u2318Y, ctrl-Y)', jade.diagram_redo,
                                  function(diagram) {
                                      return diagram.aspect && diagram.aspect.can_redo();
                                  });

            function has_selections(diagram) {
                return diagram.aspect && !diagram.aspect.read_only() && diagram.aspect.selections();
            }
            
            this.toolbar.add_tool('cut', jade.icons.cut_icon,
                                  'Cut: move selected components from diagram to the clipboard (\u2318X, ctrl-X)',
                                  jade.diagram_cut, has_selections);
            this.toolbar.add_tool('copy', jade.icons.copy_icon,
                                  'Copy: copy selected components into the clipboard (\u2318C, ctrl-C)',
                                  jade.diagram_copy, has_selections);
            this.toolbar.add_tool('paste', jade.icons.paste_icon,
                                  'Paste: copy clipboard into the diagram (\u2318V, ctrl-V)', jade.diagram_paste,
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
                                          if (selected !== undefined)
                                              return selected.has_aspect(Schematic.prototype.editor_name) && selected.can_view();
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

            // built-in memory component.  Initially hidden, will be enabled if requested
            // as a wanted part
            this.memory_part = this.toolbar.add_tool('memory', '<span>MEM</span>',
                                                     'Multi-port memory: click and drag to insert', null,
                                                     insert_part_allowed);
            part_tool(this.memory_part,this,'memory');
            this.memory_part.hide();

            part = this.toolbar.add_tool('text', jade.icons.text_icon,
                                         'Text: click and drag to insert', null, 
                                         insert_part_allowed);
            part_tool(part,this,'text');

            this.toolbar.add_spacer();
        }

        // add external tools
        var tools = parent.configuration.tools || [];
        for (var i = 0; i < schematic_tools.length; i += 1) {
            var info = schematic_tools[i]; // [name,icon,tip,callback,enable_check]
            if (tools.length > 0 && tools.indexOf(info[0]) == -1)
                continue;  // skip tool if it's not on the list
            this.toolbar.add_tool(info[0], info[1], info[2], info[3], info[4]);
        }

        div.appendChild(this.toolbar.toolbar[0]);

        div.appendChild(this.diagram.canvas);
        var aspect = new jade.model.Aspect('untitled', null);
        this.diagram.set_aspect(aspect);

        if (!parent.configuration.readonly) {
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
                    sch.resize($(div).width(),$(div).height(),true);

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
    }

    function part_tool(tool,editor,pname) {
        tool.off('click');   // different gesture for this tool
        var part = new Part(editor);
        part.set_component(jade.model.make_component([pname,[0,0,0],{}]));
        tool.mousedown(function(event) {
            editor.diagram.new_part = part;
            event.originalEvent.preventDefault();  // keep Chrome from selecting text
        });
        tool.mouseup(function(event) {
            editor.diagram.new_part = undefined;
            event.originalEvent.preventDefault();  // consume event
        });
        tool.click(function(event) {
            event.originalEvent.preventDefault();  // consume event
        });
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
        var w_parts = this.parts_bin ? this.resizer.outerWidth(true) + 1 + $(this.parts_bin.top_level).outerWidth(true) : 0;
        var h_toolbar = this.toolbar.toolbar.outerHeight(true);
        
        var tw = w -  w_extra;
        var th = h - h_extra - h_toolbar;
        e.width(tw - w_parts);
        e.height(th);

        if (this.parts_bin) {
            e = this.resizer;
            e.height(th);
            this.parts_bin.resize(tw, th, selected);
        }

        // adjust diagram to reflect new size
        if (selected) this.diagram.resize();
    };

    Schematic.prototype.show = function() {
        this.diagram.resize();
        if (this.parts_bin) this.parts_bin.show();
    };

    Schematic.prototype.set_aspect = function(module) {
        var aspect = module.aspect(Schematic.prototype.editor_name);

        $(this.tab).html(Schematic.prototype.editor_name);
        if (aspect.read_only()) $(this.tab).append(' ' + jade.icons.readonly);

        this.diagram.set_aspect(aspect);

        if (this.parts_bin) this.parts_bin.show();
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
        if (selected !== undefined && selected.can_view() && selected.has_aspect(Schematic.prototype.editor_name)) {
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
        else if (diagram.key_down(event)) return true;

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
    Wire.prototype.type = function () { return 'wire'; };
    jade.model.built_in_components.wire = Wire;
    var wire_module = {
        get_name: function () { return 'wire'; },
        has_aspect: function () { return false; },
        properties: {
            "signal": {
                "type": "signal",
                "label": "Signal name",
                "value": "",
                "edit": "yes"
            },
            "width": {
                "type": "width",
                "label": "Bus width",
                "value": "",
                "edit": "yes"
            }
        }
    };

    var wire_distance = 2; // how close to wire counts as "near by"

    Wire.prototype.load = function(json) {
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
            if (w.type() == 'wire' && w.other_end(cp1).coincident(cp2.x, cp2.y)) {
                jade.model.Component.prototype.remove.call(w);
                break;
            }
        }
    };

    Wire.prototype.draw = function(diagram) {
        var dx = this.coords[3];
        var dy = this.coords[4];

        this.draw_line(diagram, 0, 0, dx, dy);

        var width = this.properties.width;
        if (width && width > 1) {
            // perpendicular
            var x0 = dx/2;
            var y0 = dy/2;
            if (dy == 0) { dx = 0; dy = 2; }
            else if (dx == 0) {dx = 2; dy = 0; }
            else {
                var angle = Math.atan2(-dx,dy);
                dx = 2*Math.cos(angle);
                dy = 2*Math.sin(angle);
            }
            if (dx < 0) { dx = -dx; dy = -dy; }
            this.draw_line(diagram, x0-dx, y0-dy, x0+dx, y0+dy, 0.5);
            var align = (Math.abs(dy) > dx) ? (dy < 0 ? 7 : 1) : 3;
            this.draw_text(diagram, width.toString(), x0+dx, y0+dy, align, '3pt sans-serif');
            dx = this.coords[3];
            dy = this.coords[4];
        }

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
                if (dx === 0) { align = 3; dx += 4; }
                else if (dy === 0) { align = 7; dy -= 4; }
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

    Wire.prototype.propagate_select = function () {
        if (!this.selected) {
            this.selected = true;
            this.connections[0].propagate_select();
            this.connections[1].propagate_select();
        }
    };

    Wire.prototype.propagate_width = function(width) {
        var w = this.properties.width;
        if (w) {
            if (width == undefined) width = parseInt(w);
            else if (width != w) {
                this.propagate_select();
                throw "Incompatible widths specified for wire: "+w.toString()+", "+width.toString();
            }
        }

        if (width) {
            // wires "conduct" their width to the other end
            // don't worry about relabeling a cp, it won't recurse!
            this.connections[0].propagate_width(width);
            this.connections[1].propagate_width(width);
        }
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

    Wire.prototype.netlist = function(mlist, globals, prefix, mstack) {
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
    Ground.prototype.type = function () { return 'ground'; };
    jade.model.built_in_components.ground = Ground;
    var ground_module = {
        get_name: function () { return 'ground'; },
        has_aspect: function () { return false; },
        properties: {"global_signal":{"label":"Global signal name","type":"string","value":"gnd","edit":"no","choices":[""]}}
    };

    Ground.prototype.load = function(json) {
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

    Ground.prototype.netlist = function(mlist, globals, prefix, mstack) {
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
    Vdd.prototype.type = function () { return 'vdd'; };
    jade.model.built_in_components.vdd = Vdd;
    var vdd_module = {
        get_name: function () { return 'vdd'; },
        has_aspect: function () { return false; },
        properties: {"global_signal":{"label":"Global signal name","type":"signal","value":"Vdd","edit":"yes","choices":[""]}}
    };

    Vdd.prototype.load = function(json) {
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

    Vdd.prototype.netlist = function(mlist, globals, prefix, mstack) {
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
    Jumper.prototype.type = function () { return 'jumper'; };
    jade.model.built_in_components.jumper = Jumper;
    var jumper_module = {
        get_name: function () { return 'jumper'; },
        has_aspect: function () { return false; },
        properties: {}
    };

    Jumper.prototype.load = function(json) {
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
    Port.prototype.type = function () { return 'port'; };
    jade.model.built_in_components.port = Port;
    var port_module = {
        get_name: function () { return 'port'; },
        has_aspect: function () { return false; },
        properties: {
            "signal":{"label":"Signal name","type":"signal","value":"???","edit":"yes","choices":[""]},
            "direction":{"label":"Direction","type":"menu","value":"in","edit":"yes","choices":["in","out","inout"]}
        }
    };

    Port.prototype.load = function(json) {
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

        this.draw_line(diagram,-14,0,-20,0);
        var dir = this.properties.direction;
        if (dir == 'in' || dir == 'inout') {
            this.draw_line(diagram,-14,0,-16,-2);
            this.draw_line(diagram,-14,0,-16,2);
        }
        if (dir == 'out' || dir == 'inout') {
            this.draw_line(diagram,-20,0,-18,-2);
            this.draw_line(diagram,-20,0,-18,2);
        }
    };

    Port.prototype.netlist = function(mlist, globals, prefix, mstack) {
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
    Text.prototype.type = function () { return 'text'; };
    jade.model.built_in_components.text = Text;
    var text_module = {
        get_name: function () { return 'text'; },
        has_aspect: function () { return false; },
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

    Text.prototype.netlist = function(mlist, globals, prefix, mstacks) {
        return undefined;
    };

    // Multi-port memory

    function Memory(json) {
        jade.model.Component.call(this);
        this.module = memory_module; // set up properties for this component
        this.load(json);
    }
    Memory.prototype = new jade.model.Component();
    Memory.prototype.constructor = Memory;
    Memory.prototype.type = function () { return 'memory'; };
    jade.model.built_in_components.memory = Memory;
    var memory_module = {
        name: 'memory',
        get_name: function () { return 'memory'; },
        has_aspect: function () { return false; },
        properties: {
            "name":{"label":"Name","type":"name","value":"","edit":"yes","choices":[""]},
            "nports":{"label":"Number of ports","type":"menu","value":"1","edit":"yes","choices":["1","2","3"]},
            "naddr":{"label":"Width of address (1..20)","type":"custom","value":"1","edit":"yes","choices":[""]},
            "ndata":{"label":"Width of data (1..128)","type":"custom","value":"1","edit":"yes","choices":[""]},
            "contents":{"label":"Contents","type":"custom","value":"","edit":"yes","choices":[""]}
        }
    };

    Memory.prototype.rebuild_connections = function() {
        this.name = this.properties.name;
        if (this.name) this.name = this.name.toLowerCase();

        // clear out old connection points if any
        var aspect = this.aspect;   // for closures
        if (aspect) {
            $.each(this.connections,function (index,cp) {
                aspect.remove_connection_point(cp, cp.location);
            });
        }
        this.connections = [];

        // add connections for each port
        var y = 0;
        var label;
        this.ports = [];
        var p;
        for (var port = 0; port < this.properties.nports; port += 1) {
            p = {};   // keep track of connections for each port
            this.ports.push(p);
            label = 'A_'+port.toString()+'['+(this.properties.naddr-1).toString();
            label += (this.properties.naddr > 1) ? ':0]' : ']';
            p.addr = this.add_connection(0,y,label);
            label = 'D_'+port.toString()+'['+(this.properties.ndata-1).toString();
            label += (this.properties.ndata > 1) ? ':0]' : ']';
            p.data = this.add_connection(72,y,label);
            p.oe = this.add_connection(0,y+8,'OE_'+port.toString());
            p.wen = this.add_connection(0,y+16,'WE_'+port.toString());
            p.clk = this.add_connection(0,y+24,'CLK_'+port.toString());
            y += 40;
        }

        this.bounding_box = [0,-24,72,y-8];
        this.update_coords();
    };

    Memory.prototype.load = function(json) {
        this.coords = json[1];
        this.properties = json[2] || {};
        this.default_properties(); // add any missing properties

        this.rebuild_connections();
    };

    Memory.prototype.validate_property = function(pmsg,name,value) {
        var v,j,nlist;
        if (name == 'naddr') {
            v = jade.utils.parse_number(value);
            if (isNaN(v)) {
                pmsg.text('not a valid number');
                return false;
            }
            if (v < 1 || v > 20) {
                pmsg.text('not in range 1..20');
                return false;
            }
        }
        else if (name == 'ndata') {
            v = jade.utils.parse_number(value);
            if (isNaN(v)) {
                pmsg.text('not a valid number');
                return false;
            }
            if (v < 1 || v > 128) {
                pmsg.text('not in range 1..128');
                return false;
            }
        }
        else if (name == 'contents') {
            nlist = jade.utils.parse_nlist(value);
            for (j = 0; j < nlist.length; j += 1) {
                if (nlist[j] === undefined) continue;
                if (isNaN(nlist[j])) {
                    pmsg.text('item '+(j+1).toString()+' not a valid number');
                    return false;
                }
            }
        }
        return true;
    };

    Memory.prototype.update_properties = function(new_properties) {
        jade.model.Component.prototype.update_properties.call(this,new_properties);
        this.rebuild_connections();
    };

    Memory.prototype.draw = function(diagram) {
        // draw bbox
        var bb = this.bounding_box;
        this.draw_line(diagram,bb[0]+8,bb[1],bb[2]-8,bb[1]);
        this.draw_line(diagram,bb[0]+8,bb[1],bb[0]+8,bb[3]);
        this.draw_line(diagram,bb[2]-8,bb[1],bb[2]-8,bb[3]);
        this.draw_line(diagram,bb[0]+8,bb[1]+16,bb[2]-8,bb[1]+16);

        // draw stubs for each port
        var y = 0;
        var alabel = 'A['+(this.properties.naddr-1).toString();
        alabel += (this.properties.naddr > 1) ? ':0]' : ']';
        var dlabel = 'D['+(this.properties.ndata-1).toString();
        dlabel += (this.properties.ndata > 1) ? ':0]' : ']';
        var lfont = '4pt sans-serif';
        for (var port = 0; port < this.properties.nports; port += 1) {
            this.draw_line(diagram,0,y,8,y);
            this.draw_text(diagram,alabel,9,y,3,lfont);
            this.draw_line(diagram,64,y,72,y);
            this.draw_text(diagram,dlabel,63,y,5,lfont);
            this.draw_line(diagram,0,y+8,8,y+8);
            this.draw_text(diagram,'OE',9,y+8,3,lfont);
            this.draw_line(diagram,0,y+16,8,y+16);
            this.draw_text(diagram,'WE',9,y+16,3,lfont);
            this.draw_line(diagram,0,y+24,8,y+24);
            this.draw_line(diagram,8,y+22,12,y+24);  // CLK triangle
            this.draw_line(diagram,8,y+26,12,y+24);

            this.draw_line(diagram,8,y+32,64,y+32);
            y += 40;
        }

        // draw internal labels
        this.draw_text(diagram,this.properties.name || 'Memory',36,-16,7,diagram.property_font);
        var nlocns = 1 << this.properties.naddr;
        this.draw_text(diagram,nlocns.toString()+"\u00D7"+this.properties.ndata,36,-16,1,diagram.property_font);
    };

    // netlist entry: ["type", {terminal:signal, ...}, {property: value, ...}]
    Memory.prototype.netlist = function(mlist, globals, prefix, mstack) {
        if (mlist.indexOf('memory') == -1) return undefined;

        // fill in port data structure, ensuring we have the correct number of
        // connections for each terminal of each port
        var plist = [];
        var connections = {};
        $.each(this.ports,function (pindex,port) {
            var p = {};
            $.each(['addr','data','oe','wen','clk'],function (index,terminal) {
                var c = port[terminal];
                var got = c.label.length;
                var expected = c.nlist.length;
                if (got != expected) {
                    this.selected = true;
                    throw "Expected " + expected + "connections for terminal " + c.name + " of memory " + prefix + this.name + ", got" + got;
                }
                for (var i = 0; i < got; i += 1) {
                    connections[c.nlist[i]] = c.label[i];
                }
                p[terminal] = c.label;
            });
            plist.push(p);
        });
        
        // turn contents property into an array of integers
        var contents = jade.utils.parse_nlist(this.properties.contents || '');
        for (var i = 0; i < contents.length; i += 1) {
            if (contents[i] === undefined) continue;
            contents[i] = Math.floor(contents[i]);
        }

        return [['memory', connections, {
            name: prefix + this.name,
            ports: plist,
            width: this.properties.ndata,
            nlocations: 1 << this.properties.naddr,
            contents: contents
        }]];
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

        this.parts = {}; // module name => Part
    }

    PartsBin.prototype.resize = function(w, h, selected) {
        var e = $(this.top_level);
        e.height(h);
    };

    PartsBin.prototype.show = function() {
        var parts_bin = this;
        var bin = $(this.top_level);
        bin.empty();
        
        // figure out all the parts to appear in parts bin
        var pattern_list = (this.parts_wanted || ['.*']).map(function (p) { return new RegExp(p); });
        var plist = [];
        jade.model.map_modules(pattern_list,function (m) {
            var name = m.get_name();
            // only include each module once!
            if (plist.indexOf(name) == -1) plist.push(name);
        });
        // see if memory part was specified
        $.each(pattern_list,function (index,p) {
            if (p.test('memory'))
                parts_bin.editor.memory_part.show();
        });

        plist.sort();   // arrange alphabetically

        // shrink width of parts bin if there are just a few parts
        if (plist.length <= 5) bin.width(75);

        var current = '';
        var parts_list;
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
                .mouseup(part_mouse_up);

            // you can only edit parts in the parts bin if in hierarchical mode
            if (parts_bin.editor.jade.configuration.hierarchical && part.component.can_view()) {
                part.canvas.dblclick(part_dblclick);
                part.can_edit = true;
            }

            // add icon to parts bin along with new header if needed
            var path = part.component.module.get_name().split('/');
            var lname = path.length > 1 ? path.slice(0,path.length-1).join('/') : '/user';
            if (current != lname) {
                var header = $('<div class="jade-xparts-header"></div>');
                header.append('<span class="fa fa-caret-down fa-fw"></span>');
                header.append(lname);
                parts_list =  $('<div class="jade-xparts-list"></div>');

                // allow user to open/close a particular parts bin
                var local_parts_list = parts_list; // for closure
                var arrow = $('span',header);
                header.on('click',function (event) {
                    if (arrow.hasClass('fa-caret-down'))
                        arrow.removeClass('fa-caret-down').addClass('fa-caret-right');
                    else
                        arrow.removeClass('fa-caret-right').addClass('fa-caret-down');
                    local_parts_list.animate({height: 'toggle'});
                    event.preventDefault();
                    return false;
                });

                current = lname;
                bin.append(header,local_parts_list);
            }
            parts_list.append(part.canvas);
        });

        // bug?  nudge DOM's redraw so it will actually display the newly added part
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
        this.canvas = $('<canvas class="jade-xpart"></div>');
        this.canvas[0].part = this;

        // handle retina devices properly
        var context = this.canvas[0].getContext('2d');
        var devicePixelRatio = window.devicePixelRatio || 1;
        var backingStoreRatio = context.webkitBackingStorePixelRatio ||
                context.mozBackingStorePixelRatio ||
                context.msBackingStorePixelRatio ||
                context.oBackingStorePixelRatio ||
                context.backingStorePixelRatio || 1;
        this.pixelRatio = 1; //devicePixelRatio / backingStoreRatio;

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

    Part.prototype.draw_text = function(text, x, y, font) {
        // most text not displayed for the parts icon
        this.draw_text_important(text,x,y,font);
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
        else tip = part.component.type();
        tip += ': drag onto diagram to insert';
        if (part.can_edit) tip += ', double click to edit';

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

        event.originalEvent.preventDefault();  // keep Chrome from selecting text
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
        event.preventDefault();
        return false;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        schematic_tools: schematic_tools,
        text_alignments: text_alignments,
        text_bbox: text_bbox
    };

};

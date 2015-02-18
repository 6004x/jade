// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.icon_view = function(jade) {

    //////////////////////////////////////////////////////////////////////
    //
    // Icon aspect
    //
    //////////////////////////////////////////////////////////////////////

    var icon_tools = [];

    function Icon(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.tab = div.tab;

        this.diagram = new jade.Diagram(this, 'jade-icon-diagram');
        div.diagram = this.diagram;

        this.diagram.grid = 8;
        this.diagram.zoom_factor = 1.25; // scaling is some power of zoom_factor
        this.diagram.zoom_min = Math.pow(this.diagram.zoom_factor, 1);
        this.diagram.zoom_max = Math.pow(this.diagram.zoom_factor, 10);
        this.diagram.origin_min = -64; // in grids
        this.diagram.origin_max = 64;

        // register event handlers
        $(this.diagram.canvas)
            .mouseover(icon_mouse_enter)
            .mouseout(icon_mouse_leave)
            .mousemove(icon_mouse_move)
            .mousedown(icon_mouse_down)
            .mouseup(icon_mouse_up)
            .dblclick(icon_double_click)
            .keydown(icon_key_down);

        this.toolbar = new jade.Toolbar(this.diagram);

        if (!parent.configuration.readonly) {

            this.toolbar.add_tool('grid', jade.icons.grid_icon,
                                  'Toggle schematic grid', jade.diagram_toggle_grid);
            this.toolbar.add_spacer();

            this.toolbar.add_tool('undo', jade.icons.undo_icon, 'Undo: undo effect of previous action (\u2318Z, ctrl-Z)', jade.diagram_undo,
                                  function(diagram) {
                                      return diagram.aspect && diagram.aspect.can_undo();
                                  });
            this.toolbar.add_tool('redo', jade.icons.redo_icon, 'redo: redo effect of next action (\u2318Y, ctrl-Y)', jade.diagram_redo,
                                  function(diagram) {
                                      return diagram.aspect && diagram.aspect.can_redo();
                                  });

            function has_selections(diagram) {
                return diagram.aspect && !diagram.aspect.read_only() && diagram.aspect.selections();
            }
            
            this.toolbar.add_tool('cut', jade.icons.cut_icon, 'Cut: move selected components from diagram to the clipboard (\u2318X, ctrl-X)', jade.diagram_cut, has_selections);
            this.toolbar.add_tool('copy', jade.icons.copy_icon, 'Copy: copy selected components into the clipboard (\u2318C, ctrl-C)', jade.diagram_copy, has_selections);
            this.toolbar.add_tool('paste', jade.icons.paste_icon, 'Paste: copy clipboard into the diagram (\u2318V, ctrl-V)', jade.diagram_paste,
                                  function(diagram) {
                                      return diagram.aspect && !diagram.aspect.read_only() &&
                                          jade.clipboards[diagram.editor.editor_name].length > 0;
                                  });
            this.toolbar.add_tool('fliph', jade.icons.fliph_icon, 'Flip Horizontally: flip selection horizontally', jade.diagram_fliph, has_selections);
            this.toolbar.add_tool('flipv', jade.icons.flipv_icon, 'Flip Vertically: flip selection vertically', jade.diagram_flipv, has_selections);
            this.toolbar.add_tool('rotcw', jade.icons.rotcw_icon, 'Rotate Clockwise: rotate selection clockwise', jade.diagram_rotcw, has_selections);
            this.toolbar.add_tool('rotccw', jade.icons.rotccw_icon, 'Rotate Counterclockwise: rotate selection counterclockwise', jade.diagram_rotccw, has_selections);

            this.toolbar.add_spacer();

            // add tools for creating icon components
            function insert_part_allowed() {
                return this.diagram && this.diagram.aspect && !this.diagram.aspect.read_only(); 
            };

            this.modes = {};
            this.modes.select = this.toolbar.add_tool('select', jade.icons.select_icon, 'Select mode', icon_select,insert_part_allowed);
            this.set_mode('select');
            this.modes.line = this.toolbar.add_tool('line', jade.icons.line_icon, 'Icon line mode', icon_line,insert_part_allowed);
            this.modes.arc = this.toolbar.add_tool('arc', jade.icons.arc_icon, 'Icon arc mode', icon_arc,insert_part_allowed);
            this.modes.circle = this.toolbar.add_tool('circle', jade.icons.circle_icon, 'Icon circle mode', icon_circle,insert_part_allowed);
            this.modes.text = this.toolbar.add_tool('text', jade.icons.text_icon, 'Icon text mode', icon_text,insert_part_allowed);
            this.modes.terminal = this.toolbar.add_tool('terminal', jade.icons.terminal_icon, 'Icon terminal mode', icon_terminal,insert_part_allowed);
            this.modes.property = this.toolbar.add_tool('property', jade.icons.property_icon, 'Icon property mode', icon_property,insert_part_allowed);

            this.toolbar.add_spacer();
        }
        // add external tools
        for (var i = 0; i < icon_tools.length; i += 1) {
            var info = icon_tools[i]; // [name,icon,tip,callback,enable_check]
            this.toolbar.add_tool(info[0], info[1], info[2], info[3], info[4]);
        }

        div.appendChild(this.toolbar.toolbar[0]);

        div.appendChild(this.diagram.canvas);
        var aspect = new jade.model.Aspect('untitled', null);
        this.diagram.set_aspect(aspect);
    }

    Icon.prototype.diagram_changed = function(diagram) {
        var module = diagram.aspect.module;
        if (module) {
            var tests = this.jade.configuration.tests;
            delete tests[module.get_name()];
            module.notify_listeners('icon_changed');
        }
    };

    Icon.prototype.resize = function(w, h, selected) {
        this.w = w;
        this.h = h;

        // schematic canvas
        var e = $(this.diagram.canvas);

        var w_extra = e.outerWidth(true) - e.width();
        var h_extra = e.outerHeight(true) - e.height();
        var h_toolbar = this.toolbar.toolbar.outerHeight(true);
        
        var tw = w -  w_extra;
        var th = h - h_extra - h_toolbar;
        e.width(tw);
        e.height(th);

        // adjust diagram to reflect new size
        if (selected) this.diagram.resize();
    };

    Icon.prototype.show = function() {
        this.diagram.canvas.focus(); // capture key strokes
        this.resize(this.w,this.h,true);
    };

    Icon.prototype.set_aspect = function(module) {
        var aspect = module.aspect(Icon.prototype.editor_name);

        $(this.tab).html(Icon.prototype.editor_name);
        if (aspect.read_only()) $(this.tab).append(' ' + jade.icons.readonly);

        this.diagram.set_aspect(aspect);
    };

    Icon.prototype.editor_name = 'icon';
    jade.editors.push(Icon);

    Icon.prototype.redraw = function(diagram) {
        if (this.toolbar) this.toolbar.enable_tools(this.diagram);

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
        'select': 'Click component to select, click and drag on background for area select, shift-click and drag on background to pan',
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

        var c = jade.model.built_in_components[mode];
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
        else if (diagram.key_down(event)) return true;

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
        var c = jade.model.make_component([editor.mode, [editor.start_x, editor.start_y, 0]]);
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

    //////////////////////////////////////////////////////////////////////
    //
    // Built-in icon components
    //
    //////////////////////////////////////////////////////////////////////

    // line  (arc if you pull at the middle to provide a third point?)
    function Line(json) {
        jade.model.Component.call(this);
        this.module = line_module;
        this.load(json);
    }
    Line.prototype = new jade.model.Component();
    Line.prototype.constructor = Line;
    Line.prototype.required_grid = 1;
    Line.prototype.type = function () { return 'line'; };
    jade.model.built_in_components.line = Line;
    var line_module = {
        get_name: function () { return 'line'; },
        has_aspect: function () { return false; },
        properties: {}
    };

    var line_distance = 2; // how close to line counts as "near by"

    Line.prototype.load = function(json) {
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
        jade.model.canonicalize(r);
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
        jade.model.Component.call(this);
        this.module = arc_module;
        this.load(json);
    }
    Arc.prototype = new jade.model.Component();
    Arc.prototype.constructor = Arc;
    Arc.prototype.required_grid = 1;
    Arc.prototype.type = function () { return 'arc'; };
    jade.model.built_in_components.arc = Arc;
    var arc_module = {
        get_name: function () { return 'arc'; },
        has_aspect: function () { return false; },
        properties: {}
    };

    Arc.prototype.load = function(json) {
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
            jade.model.canonicalize(r);
            if (ex < r[0]) r[0] = ex;
            else if (ex > r[2]) r[2] = ex;
            if (ey < r[1]) r[1] = ey;
            else if (ey > r[3]) r[3] = ey;
            jade.model.canonicalize(r);
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

    // circle: center point + radius
    function Circle(json) {
        jade.model.Component.call(this);
        this.module = circle_module;
        this.load(json);
    }
    Circle.prototype = new jade.model.Component();
    Circle.prototype.constructor = Circle;
    Circle.prototype.required_grid = 1;
    Circle.prototype.type = function () { return 'circle'; };
    jade.model.built_in_components.circle = Circle;
    var circle_module = {
        get_name: function () { return 'circle'; },
        has_aspect: function () { return false; },
        properties: {}
    };

    Circle.prototype.load = function(json) {
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
        jade.model.Component.call(this);
        this.module = property_module;
        this.load(json);
    }
    Property.prototype = new jade.model.Component();
    Property.prototype.constructor = Property;
    Property.prototype.required_grid = 1;
    Property.prototype.type = function () { return 'property'; };
    jade.model.built_in_components.property = Property;
    var property_module = {
        get_name: function () { return 'property'; },
        has_aspect: function () { return false; },
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
                "choices": jade.schematic_view.text_alignments
            }
        }
    };

    Property.prototype.load = function(json) {
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        this.bounding_box = jade.schematic_view.text_bbox(this.properties.format, this.properties.align, '5pt sans-serif');
        this.update_coords();
    };

    Property.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Property.prototype.draw = function(diagram) {
        if (this.selected) {
            // "+" marks the reference point for the property
            this.draw_line(diagram, - 1, 0, 1, 0);
            this.draw_line(diagram, 0, - 1, 0, 1);
        }

        var align =  jade.schematic_view.text_alignments.indexOf(this.properties.align);
        this.draw_text(diagram, this.properties.format || '-no format-', 0, 0, align, diagram.property_font);
    };

    Property.prototype.draw_icon = function(c, diagram) {
        var s = this.properties.format || '-no format-';

        // name property is special
        if (/\{name\}/.test(s)) {
            // don't draw name property if it begins with $ (it's a gensym)
            if (c.properties.name && c.properties.name[0] == '$') return;
        }

        // replace occurences of {pname} in format with the
        // corresponding property value
        for (var p in c.properties) {
            var v = c.properties[p] || '';
            s = s.replace(new RegExp("\\{" + p + "\\}", "gm"), v);
        }
        s = s.replace(new RegExp("\\{module\\}", "gm"), c.module.get_name());

        // need to adjust alignment accounting for our rotation
        var align =  jade.schematic_view.text_alignments.indexOf(this.properties.align);
        align = jade.model.aOrient[this.coords[2] * 9 + align];

        c.draw_text(diagram, s, this.coords[0], this.coords[1], align, diagram.property_font);
    };

    Property.prototype.edit_properties = function(diagram, x, y) {
        return jade.model.Component.prototype.edit_properties.call(this, diagram, x, y, function(c) {
            c.bounding_box = jade.schematic_view.text_bbox(c.properties.format, c.properties.align, diagram.property_font);
            c.update_coords();
        });
    };

    // icon terminal (turns into connection point when module is instantiated)
    function Terminal(json) {
        jade.model.Component.call(this);
        this.module = terminal_module;
        this.load(json);
    }
    Terminal.prototype = new jade.model.Component();
    Terminal.prototype.constructor = Terminal;
    Terminal.prototype.required_grid = 8;
    Terminal.prototype.type = function () { return 'terminal'; };
    jade.model.built_in_components.terminal = Terminal;
    var terminal_module = {
        get_name: function () { return 'terminal'; },
        has_aspect: function () { return false; },
        properties: {
            "name": {
                "type": "signal",
                "label": "Terminal name",
                "value": "???",
                "edit": "yes"
            },
            "line": {
                "type": "menu",
                "label": "Draw line?",
                "value": "yes",
                "edit": "yes",
                "choices": ["yes", "no"]
            }
        }
    };

    Terminal.prototype.load = function(json) {
        this.coords = json[1];
        this.properties = json[2] || {};

        this.default_properties(); // add any missing properties

        this.bounding_box = [-jade.model.connection_point_radius, -jade.model.connection_point_radius,
                             8 + jade.model.connection_point_radius, jade.model.connection_point_radius];
        this.update_coords();
    };

    Terminal.prototype.drag_callback = function(x, y, action) {
        // nothing to do
        return true;
    };

    Terminal.prototype.draw = function(diagram) {
        this.draw_circle(diagram, 0, 0, jade.model.connection_point_radius, false);
        if (this.properties.line != 'no') this.draw_line(diagram, 0, 0, 8, 0);
        this.draw_text(diagram, this.properties.name, jade.model.connection_point_radius - 4, 0, 5, diagram.property_font);
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

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        icon_tools: icon_tools
    };
};


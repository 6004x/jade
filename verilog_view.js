// Copyright (C) 2018 Massachusetts Institute of Technology
// Chris Terman

jade_defs.verilog_view = function(jade) {

    //////////////////////////////////////////////////////////////////////
    //
    // Verilog editor
    //
    //////////////////////////////////////////////////////////////////////

    var verilog_tools = [];

    function VerilogEditor(div, parent) {
        var editor = this;
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;
        this.aspect = undefined;
        this.verilog_component = undefined;
        this.tab = div.tab;
<<<<<<< HEAD
        this.textarea = $('<textarea class="jade-test-editor"></textarea>');
        div.appendChild(this.textarea[0]);

        this.cm = CodeMirror.fromTextArea(this.textarea[0],{ mode: 'verilog' }); 
=======

        // set up toolbar
        this.toolbar = new jade.Toolbar(this);
        this.toolbar.add_tool('check', jade.icons.check_icon,
                              'Check: run tests', jade.test_view.do_test);
        div.appendChild(this.toolbar.toolbar[0]);

        // set up editor
        this.textarea = $('<textarea class="jade-verilog-editor"></textarea>');
        div.appendChild(this.textarea[0]);

        this.cm = CodeMirror.fromTextArea(this.textarea[0],{
            mode: 'verilog',
            lineWrapping: true,
            lineNumbers: true
        }); 

>>>>>>> progress
        // keep component up-to-date
        this.cm.on('changes', function (cm) {
            if (editor.verilog_component) {
                var text = editor.cm.getValue();
                if (editor.verilog_component.verilog != text) {
                    editor.verilog_component.verilog = text;
                    editor.aspect.set_modified(true);
                }
                editor.toolbar.enable_tools(editor);
            }
        });
<<<<<<< HEAD
=======

        this.editor = this;  // for test_view
        this.canvas = this.textarea;
>>>>>>> progress
    }

    VerilogEditor.prototype.resize = function(w, h, selected) {
        this.w = w;
        this.h = h;

        var e = this.textarea;

        var w_extra = e.outerWidth(true) - e.width();
        var h_extra = e.outerHeight(true) - e.height();
        var h_toolbar = this.toolbar.toolbar.outerHeight(true);
        
        var tw = w -  w_extra;
        var th = h - h_extra - h_toolbar;
        e.width(tw);
        e.height(th);
        this.cm.setSize(tw,th);
    };

    VerilogEditor.prototype.redraw_background = function() { };

    VerilogEditor.prototype.message = function(message) {
        if (this.status) this.status.html(message);
    };

    VerilogEditor.prototype.clear_message = function(message) {
        if (this.status && this.status.text() == message) this.status.text('');
    };

    VerilogEditor.prototype.show = function() {
        this.resize(this.w,this.h,true);
        this.toolbar.enable_tools(this);
        this.cm.refresh();
    };

    VerilogEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.aspect = module.aspect('verilog');

        // we'll synthesize a netlist when one is called for
        this.aspect.netlist = this.verilog_netlist;

        this.verilog_component = this.aspect.components[0];
        if (this.verilog_component === undefined) {
            this.verilog_component = jade.model.make_component(["verilog",""]);
            this.aspect.add_component(this.verilog_component);
        }
        this.cm.setValue(this.verilog_component.verilog);
        this.cm.refresh();

        $(this.tab).html(VerilogEditor.prototype.editor_name);

        if (this.aspect.read_only()) {
            this.cm.setOption('readOnly',true);
            $(this.tab).append(' ' + jade.icons.readonly);
        } else {
            this.cm.setOption('readOnly',false);
        }
    };

    // mlist is a list of module names that are the leaves of the extraction tree.
    // port_map is an associative array: local_sig => external_sig
    // mstack is an array of parent module names so we can detect recursion
    VerilogEditor.prototype.verilog_netlist = function (mlist, globals, prefix, port_map, mstack) {
        var n = this.module.get_name();
        if (mstack.indexOf(n) != -1) {
            // oops, recursive use of module.  complain!
            mstack.push(n);  // just to make the message easy to construct
            throw 'Recursive inclusion of module:\n'+mstack.join(' \u2192 ');
        }
        mstack.push(n);  // remember that we're extracting this module
        
        // synthesize a netlist from the verilog source
        var netlist = [];
        var tokens = this.tokenize();
        if (tokens) {
            var parse_tree = this.parse(tokens);
            if (parse_tree) {
                netlist = this.synthesize(parse_tree, mlist, globals, prefix, port_map, mstack);
            }
        }

        mstack.pop();   // all done with extraction, remove module name
        return netlist;
    };

    VerilogEditor.prototype.event_coords = function () { };

    VerilogEditor.prototype.check = function () {
        // more here...
    };

    VerilogEditor.prototype.message = function(msg) {
        this.status.text(msg);
    };

    VerilogEditor.prototype.clear_message = function(msg) {
        if (this.status.text() == msg)
            this.status.text('');
    };

    VerilogEditor.prototype.editor_name = 'verilog';
    jade.editors.push(VerilogEditor);

    // Verilog component that lives inside a Verilog aspect
    function Verilog(json) {
        jade.model.Component.call(this);
        this.load(json);
    }
    Verilog.prototype = new jade.model.Component();
    Verilog.prototype.constructor = Verilog;
    Verilog.prototype.type = function () { return 'verilog'; };
    jade.model.built_in_components.verilog = Verilog;

    Verilog.prototype.load = function(json) {
        this.verilog = json[1];
    };

    Verilog.prototype.json = function() {
        return [this.type(), this.verilog];
    };

    //////////////////////////////////////////////////////////////////////
    //
    // Synthesis
    //
    //////////////////////////////////////////////////////////////////////

    // return list of token objects
    Verilog.prototype.tokenize = function() {
    };

    // generate parse tree from list of tokens
    Verilog.prototype.parse = function(tokens) {
    };
    
    // generate netlist from parse tree
    Verilog.prototype.synthesize = function(parse_tree, mlist, globals, prefix, port_map, mstack) {
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
    };

};

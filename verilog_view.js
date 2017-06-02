// Copyright (C) 2011-2017 Massachusetts Institute of Technology
// Chris Terman

jade_defs.verilog_view = function(jade) {

    //////////////////////////////////////////////////////////////////////
    //
    // Verilog editor
    //
    //////////////////////////////////////////////////////////////////////

    function VerilogEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;
        this.aspect = undefined;
        this.verilog_component = undefined;
        this.tab = div.tab;

        this.cm = CodeMirror(div, {
            lineWrapping: true,
            lineNumbers: true
        });

        // on changes, update verilog component of module's verilog aspect
        var editor = this;  // for closure
        this.cm.on('changes',function() {
            if (editor.verilog_component) {
                var text = editor.cm.getValue();
                if (editor.verilog_component.verilog != text) {
                    editor.verilog_component.verilog = text;
                    editor.aspect.set_modified(true);
                }
            }
        });

    }

    VerilogEditor.prototype.resize = function(w, h, selected) {
        this.cm.setSize(w,h);
    };

    VerilogEditor.prototype.show = function() {};

    VerilogEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.aspect = module.aspect('verilog');
        this.verilog_component = this.aspect.components[0];
        if (this.verilog_component === undefined) {
            this.verilog_component = jade.model.make_component(["verilog",""]);
            this.aspect.add_component(this.verilog_component);
        }
        this.cm.setValue(this.verilog_component.verilog);

        $(this.tab).html(VerilogEditor.prototype.editor_name);

        if (this.aspect.read_only()) {
            this.cm.setOption('readOnly',true);
            $(this.tab).append(' ' + jade.icons.readonly);
        } else {
            this.cm.setOption('readOnly',false);
        }
    };

    VerilogEditor.prototype.event_coords = function () { };

    VerilogEditor.prototype.message = function(msg) {
        this.status.text(msg);
    };

    VerilogEditor.prototype.clear_message = function(msg) {
        if (this.status.text() == msg)
            this.status.text('');
    };

    VerilogEditor.prototype.editor_name = 'verilog';
    jade.editors.push(VerilogEditor);

    // Verilog component that lives inside a verilog aspect
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

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
    };

};

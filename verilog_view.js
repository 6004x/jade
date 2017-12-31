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

        this.editor = this;  // for test_view
        this.canvas = this.textarea;
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
        var result = tokenize(this.module.get_name());
        if (result.errors.length == 0) {
            result = parse(result.tokens);
            if (result.errors.length == 0) {
                result = synthesize(result.parse_tree, mlist, globals, prefix, port_map, mstack);
                if (result.errors.length == 0) netlist = result.netlist;
                else {
                    // deal with errors here
                }
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
        this.verilog = '';
        this.errors = [];
        this.load(json);
    }
    Verilog.prototype = new jade.model.Component();
    Verilog.prototype.constructor = Verilog;
    Verilog.prototype.type = function () { return 'verilog'; };
    jade.model.built_in_components.verilog = Verilog;

    Verilog.prototype.load = function(json) {
        this.verilog = json[1];
        this.errors = [];
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
    function tokenize(module_name) {
        // patterns for all the lexical elements
	var string_pattern = /"(\\.|[^"])*"/;     // string: enclosed in quotes, contains escaped chars
        var comment_multiline_pattern = /\/\*(.|\n)*\*\//;  // comment: /* ... */
        var comment_pattern = /\/\/.*\n/;          // comment: double slash till the end of the line
        var attribute_pattern = /\(\*(.|\n)*\*\)/;  // attribute: (* ... *)
	var directive_pattern = /\`\w+/;
        var integer_pattern = /(\d*)\'(d|sd)([0-9_]+)|(\d*)\'(b|sb)([01xXzZ?_]+)|(\d*)?\'(o|so)([0-7xXzZ?_]+)|(\d*)\'(h|sh)([0-9a-fA-FxXzZ?_]+)|[0-9_]+/;
        var names_pattern = /[A-Za-z_$][A-Za-z0-9_$\.]*|\\\S+/;
        // order matters for oper_pattern!  match longer strings before shorter strings
        var oper_pattern = /\~\&|\~\||\~\^|\&\&|\|\||\^\~|\=\=\=|\=\=|\!\=\=|\!\=|\<\<|\<\=|\>\>|\>\=|[()[\]{}=.<>,;\n+\-*/%&|^?:~!]/;

        // pattern for a token.  Order matters for strings and comments.
        var token_pattern = (
            string_pattern.source + '|' + 
            comment_multiline_pattern.source + '|' + 
            comment_pattern.source + '|' +
            attribute_pattern.source + '|' +
            directive_pattern.source + '|' +
            oper_pattern.source + '|' +
            integer_pattern.source + '|' +
            names_pattern.source);

        // a stack of {pattern, contents, filename, line_number, line_offset}
        // Note that the RegEx patten keeps track of where the next token match will
        // start when pattern.exec is called.  The other parts of the state are used
        // when generating error reports.
        // An `include directive will push another state onto the stack, interrupting
        // the processing of the current buffer. The last state on the stack is the one
        // currently being processed.  When that contents is exhausted, the stack
        // is popped and tokenizing resumes with the buffer that had the 1include.
        var state_stack = [];

        var included_modules = [];   // list of included modules
        var tokens = [];   // resulting list of tokens
        var errors = [];   // list of errors {message: ..., token: ...}

        // work on tokenizing contents, starting with most recently pushed state
        function scan() {
            var state = state_stack[state_stack.length - 1];

            var m,type,base,token,offset;
            var include = false;   // true if next token is name of included module

            while (state !== undefined) {
                // find next token
                m = state.pattern.exec(state.contents);

                // all done with this module, return to previous module
                if (m == null) {
                    state_stack.pop();   // remove entry for file we just finished
                    state = state_stack[state_stack.length - 1];  // return to previous module
                    continue;
                }

                token = m[0];
                
                // take care of comments
                if (comment_multiline_pattern.test(token) || attribute_pattern.test(token)) {
                    // account for any matched newlines
                    m = token.split('\n');
                    state.line_number += m.length - 1;
                    state.line_offset = m[m.length - 1].length;
                    continue;
                }
                if (comment_pattern.test(token)) {
                    state.pattern.lastIndex -= 1;  // leave newline at end for next token to deal with
                    continue;
                }

                //set the token's type
                if (string_pattern.test(token)) {
                    token = token.slice(1,-1);  // chop off enclosing quotes
                    type = 'string';
                }
                else if (integer_pattern.test(token)) {
                    type = 'number';
                }
                else if (names_pattern.test(token)) {
                    type = 'name';
                }
                else if (directive_pattern.test(token)) {
                    type = 'directive';
                    if (token == '`include') {
                        // next token will be included module name
                        include = true;
                        continue;
                    }
                    // deal with other directives here...
                }
                else type = token;
                
                // create a token and do a little post-processing
                var t = {
                    type: type,
                    token: token,
                    origin_module: state.module,
                    line: state.line_number,
                    column: m.index - state.line_offset
                };

                if (token == "/*") {
                    // check for unclosed comments
                    errors.push({message: "Unclosed comment", token: t});
                    return;
                }
                else if (token == "(*") {
                    // check for unclosed attributes
                    errors.push({message: "Unclosed attribute", token: t});
                    return;
                }
                else if (type == "number") {
                    if (/\'(h|sh)'/.test(token)) base = 'hex';
                    else if (/\'(b|sb)]/.test(token)) base = 'bin';
                    else if (/\'(o|so)]/.test(token)) base = 'oct';
                    else base = 'dec';
                    // parse numbers here
                }
                else if (include) {
                    // push new buffer onto state stack
                    process_module(token,t);
                    include = false;
                    continue;
                }
                else if (token == "\n") {
                    // increment line number and calculate new line offset
                    state.line_number += 1;
                    state.line_offset = m.index + 1;
                    continue;
                }

                // finally add token to our list and look for the next one
                tokens.push(t);
            }
        }

        // push a state for the new module the state stack and restart tokenizing process
        function process_module(module_name,t) {
            if (included_modules.indexOf(module_name) != -1) {
                errors.push({message: "File included more than once", token:t});
            } else {
                included_modules.push(module_name);

                // pattern keeps track of processing state, so make a new one for each file to be processed
                var pattern = RegExp(token_pattern,'g');

                // get contents of verilog aspect of module
                var verilog = jade.model.find_module(module_name).aspect('verilog').components[0];
                if (verilog instanceof Verilog) {
                    state_stack.push({contents: verilog.verilog + '\n',     // add trailing newline just in case
                                      module: module_name,
                                      line_number: 1,
                                      line_offset: 0,
                                      pattern: pattern
                                     });
                }
            }
        }

        // process top-level module
        process_module(module_name);
        scan();  // start the ball rolling
        return {tokens: tokens, errors: errors};
    };

    // generate parse tree from list of tokens
    function parse(tokens) {
        return {parse_tree: {}, errors: []};
    };
    
    // generate netlist from parse tree
    function synthesize(parse_tree, mlist, globals, prefix, port_map, mstack) {
        return {netlist: [], errors: []};
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
    };

};

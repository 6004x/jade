// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

// pollute the global namespace with a single variable
var jade_defs = {};
var jade_dump_json;   // function for grabbing JSON dumps of modules
var jade_load_json;   // function for loading JSON dumps of modules
var jade_load_edx; // function for loading student edX submissions into editor

// "new jade_defs.jade()" will build a self-contained jade object so we can
// have multiple instances on the same webpage that don't share any
// state stored in shared variables.
jade_defs.jade = function() {
    var j = this;

    $.extend(j,jade_defs.top_level(j));

    j.model = jade_defs.model(j);
    jade_defs.netlist(j);
    jade_defs.icons(j);
    j.schematic_view = jade_defs.schematic_view(j);
    j.icon_view = jade_defs.icon_view(j);
    j.property_view = jade_defs.property_view(j);
    j.test_view = jade_defs.test_view(j);
    j.utils = jade_defs.utils(j);
    j.plot = jade_defs.plot(j);
    j.device_level = jade_defs.device_level(j);
    j.cktsim = jade_defs.cktsim(j);
    j.gate_level = jade_defs.gate_level(j);
    j.gatesim = jade_defs.gatesim(j);
    jade_defs.analog(j);
    jade_defs.gates(j);
};

jade_defs.top_level = function(jade) {

    var version = "Jade 2.2.52 (2016 \u00A9 MIT EECS)";

    var about_msg = version +
            "<p>Chris Terman wrote the schematic entry, testing and gate-level simulation tools." +
            "<p>Jacob White wrote the simulation engine for the device-level simulation tools."+
            "<p>We are grateful to Quanta Computer Incorporated for their support of the development of the Jade schematic entry and simulation tool as part of a research project on educational technologies with the MIT Computer Science and Artificial Intelligence Laboratory.";

    //////////////////////////////////////////////////////////////////////
    //
    // Editor framework
    //
    //////////////////////////////////////////////////////////////////////

    var editors = []; // list of supported aspects

    var clipboards = {}; // clipboards for each editor type

    function Jade(owner) {
        owner.jade = this;
        this.jade = jade;
        this.parent = owner;
        this.module = undefined;
        this.configuration = {};

        // insert framework into DOM
        this.top_level = $('<div class="jade-top-level">' +
                           ' <div id="module-tools" class="jade-toolbar"></div>' +
                           ' <div class="jade-tabs-div"></div>' +
                           ' <div class="jade-resize-icon"></div>' +
                           ' <div class="jade-version"><a href="#">'+version+'</a></div>' +
                           ' <div class="jade-status"><span id="message"></span></div>' +
                           '</div>');
        $('.jade-resize-icon',this.top_level).append(jade.icons.resize_icon);
        $(owner).append(this.top_level);

        $('.jade-version a',this.top_level).on('click',function (event) {
            jade_window('About Jade',$('<div class="jade-about"></div>').html(about_msg),$(owner).offset());
            event.preventDefault();
            return false;
        });

        this.status = this.top_level.find('#message');

        // set up module tools at the very top
        this.module_tools = this.top_level.find('#module-tools');
        this.module_tools.append('<span>Module:</span><select id="module-select"></select>');
        this.module_tools.append(this.module_tool(jade.icons.edit_module_icon,'edit-module','Edit/create module',edit_module,'hierarchy-tool'));
        this.module_tools.append(this.module_tool(jade.icons.copy_module_icon,'copy-module','Copy current module',copy_module,'hierarchy-tool'));
        this.module_tools.append(this.module_tool(jade.icons.delete_module_icon,'delete-module','Delete current module',delete_module,'hierarchy-tool'));
        this.module_tools.append(this.module_tool(jade.icons.download_icon,'download-modules','Save modules to module clipboard',download_modules));
        this.module_tools.append(this.module_tool(jade.icons.upload_icon,'upload-modules','Select modules to load from module clipboard',upload_modules));
        this.module_tools.append(this.module_tool(jade.icons.recycle_icon,'start-over','Discard all work on this problem and start over',start_over));
        if (jade.cloud_upload) {
            this.module_tools.append(this.module_tool(jade.icons.cloud_upload_icon,'cloud-upload','Upload designs to the cloud',jade.cloud_upload));
        }
        if (jade.cloud_download) {
            this.module_tools.append(this.module_tool(jade.icons.cloud_download_icon,'cloud-download','Dowload designs from the cloud',jade.cloud_download));
        }

        /*
        var mailto = $('<a href="#"><span class="fa fa-lg fa-envelope-o"></span>"');
        mailto.on('click',function (event) {
            window.location = "mailto:cjt@mit.edu?Subject=&body=bar";
            return false;
        });
        this.module_tools.append(mailto);
         */
        

        $('#module-select',this.module_tools).on('change',function () {
            owner.jade.edit($(this).val());
        });

        // now add a display tab for each registered editor
        this.tabs_div = this.top_level.find('.jade-tabs-div');
        this.tabs = {}; 
        this.selected_tab = undefined;

        // add status line at the bottom
        this.status.text('Copyright \u00A9 MIT EECS 2011-2015');

        // set up handler to resize jade
        var me = this;
        if ($(owner).hasClass('jade-resize')) {
            $('.jade-resize-icon',this.top_level)
                .css('display','inline')
                .on('mousedown',function (event) {
                    var doc = $(document).get(0);
                    var div = $(owner);
                    var rx = event.pageX;
                    var ry = event.pageY;

                    function move(event) {
                        var w = div.width() + event.pageX - rx;
                        var h = div.height() + event.pageY - ry;
                        div.width(w);
                        div.height(h);
                        // requery size in case it's been constrained by css
                        me.resize(div.width(),div.height());
                        rx = event.pageX;
                        ry = event.pageY;
                        return false;
                    };

                    function up(event) {
                        doc.removeEventListener('mousemove',move,true);
                        doc.removeEventListener('mouseup',move,true);
                        return false;
                    }

                    // add handlers to document so we capture them no matter what
                    doc.addEventListener('mousemove',move,true);
                    doc.addEventListener('mouseup',up,true);
                    return false;
                });
        } else {
            // we're full screen, so resize when window resizes
            $(window).on('resize',function() {
                var body = $('body');
                // 8, 12 are fudge factors to avoid scrollbars...
                var win_w = $(window).width() - (body.outerWidth(true) - body.width()) - 8;
                var win_h = $(window).height() - (body.outerHeight(true) - body.height()) - 12;
                me.resize(win_w,win_h);
            });
        }
    }

    Jade.prototype.module_tool = function (icon,id,tip,action,extra_classes) {
        var tool = $('<span></span>').append(icon).addClass('jade-module-tool jade-tool-enabled').attr('id',id);
        if (extra_classes) tool.addClass(extra_classes);

        var j = this;  // for closure
        tool.on('click',function (event) {
            if (action) action(j,event);
            event.preventDefault();
            return false;
        });

        tool.on('mouseenter',function () {
            j.status.html(tip);
        });

        tool.on('mouseleave',function () {
            j.status.html('');
        });

        return tool;
    };

    // helper function for dumping json for modules -- make accessible at top level
    jade_dump_json = function (mname,dirty_only) {
        var p = new RegExp(mname);
        var result = {};
        $.each(jade.model.get_modules(),function (mname,module) {
            if (p.test(mname)) {
                result[mname] = module.json(dirty_only);
            }
        });
        return JSON.stringify(result);
    };

    // helper function for loading json -- make accessible at top level
    jade_load_json = function (json) {
        jade.model.load_json(JSON.parse(json));
    };

    jade_load_edx = function(s) {
        var edx_state = JSON.parse(s).state;
        var design = JSON.parse(edx_state).state;
        jade.model.load_json(design);
        var modules = Object.keys(design);
        $('.jade')[0].jade.edit(modules[0]);
        return modules;
    };

    // initialize editor from configuration object
    Jade.prototype.initialize = function (config) {
        var me = this;
        $.extend(this.configuration,config);

        $('#start-over',this.module_tools).toggle(this.configuration.state && this.configuration.initial_state);
        $('#cloud-upload',this.module_tools).toggle(this.configuration.cloud_url !== undefined);
        $('#cloud-download',this.module_tools).toggle(this.configuration.cloud_url !== undefined);

        // initialize object for recording test results
        if (this.configuration.tests === undefined) this.configuration.tests = {};

        // load any shared modules from specified files
        if (this.configuration.shared_modules) {
            $.each(this.configuration.shared_modules,function (index,filename) {
                jade.model.load_modules(filename,true);
            });
        }

        // load module files, including those for user?
        if (this.configuration.modules) {
            if (typeof this.configuration.modules == 'string')
                this.configuration.modules = this.configuration.modules.split(',');
            $.each(this.configuration.modules,function (index,mfile) {
                jade.model.load_modules(mfile,false);
            });
        }

        $('.hierarchy-tool',this.top_level).toggle(this.configuration.hierarchical == 'true');

        // setup editor panes
        var elist;
        if (this.configuration.editors) {
            elist = [];
            $.each(this.configuration.editors,function(index,value) {
                // look through list of defined editors to see if we have a match
                $.each(editors,function(eindex,evalue) {
                    if (evalue.prototype.editor_name == value) elist.push(evalue);
                });
            });
        } else elist = editors;

        // clear out existing tabs
        me.tabs_div.empty();
        $('.jade-tab-body',me.top_level).remove();

        // add tabs for specified editors
        $.each(elist,function(i,editor) {
            var ename = editor.prototype.editor_name;
            clipboards[ename] = []; // initialize editor's clipboard

            // add tab selector
            var tab = $('<div class="jade-tab">'+ename+'</div>');
            me.tabs_div.append(tab);
            tab.click(function(event) {
                jade.model.save_modules();
                me.show(ename);
                event.preventDefault();
                return false;
            });

            // add body for each tab (only one will have display != none)
            var body = $('<div class="jade-tab-body"></div>');
            body[0].tab = tab[0];   // make it easy to find our tab later
            me.top_level.find('.jade-tabs-div').after(body);
            // make a new editor for this aspect
            body[0].editor = new editor(body[0], me);

            me.tabs[ename] = [tab[0], body[0]];

            // save changes to server if we're leaving this particular editor
            body.on('mouseleave',function () { jade.model.save_modules(); });
        });
        // select first aspect as the one to be displayed
        if (elist.length > 0) {
            this.show(elist[0].prototype.editor_name);
        }

        if ($(this.parent).hasClass('jade-resize'))
            this.resize($(this.parent).width(),$(this.parent).height());
        else $(window).trigger('resize');  // let editors know their size

        // load state (dictionary of module_name:json).  Start with initial_state
        // then overwrite with user's state
        if (this.configuration.initial_state) {
            jade.model.load_json(this.configuration.initial_state);
            jade.model.set_clean();  // mark current module content as clean
        }
        if (this.configuration.state)
            jade.model.load_json(this.configuration.state);

        // starting module?
        var edit = this.configuration.edit || '/user/untitled';
        if (edit[0] != '/') edit = '/user/'+edit;
        var mname = edit.split('.');          // module.aspect
        this.edit(mname[0]);  // select module
        if (mname.length > 1) this.show(mname[1]);
    };

    Jade.prototype.get_state = function() {
        // save updated test results and any aspects that
        // differ from initial state
        var state = {
            tests: this.configuration.tests,
            'required-tests': this.configuration['required-tests'],
            state: jade.model.json_modules(true).json,
            last_saved: Date.now()
        };
        if (this.configuration.help_url)
            state.help_url = this.configuration.help_url;
        if (this.configuration.student_id)
            state.help_url = this.configuration.student_id;

        // request for state means user library is being saved
        jade.model.clear_modified();

        return state;
    };

    Jade.prototype.get_grade = function() {
        return {'required-tests': this.configuration['required-tests'] || [],
                'tests': this.configuration.tests || {}
               };
    };

    // remember module and aspect for next visit
    Jade.prototype.bookmark = function() {
        if (this.module !== undefined) {
            var mark = this.module.get_name();
            if (this.selected_tab !== undefined) mark += '.' + this.selected_tab;
        }
    };

    /*
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
     */

    Jade.prototype.edit = function(module) {
        if (typeof module == 'string') module = jade.model.find_module(module);
        this.module = module;

        // update list of available modules
        var pattern_list = (this.configuration.parts || ['.*']).map(function (p) { return new RegExp(p); });
        var mlist = [];
        jade.model.map_modules(pattern_list,function (m) {
            if (m.confidential()) return;  // can't view confidential models
            var name = m.get_name();
            // only include each module once!
            if (mlist.indexOf(name) == -1) mlist.push(name);
        });
        build_select(mlist.sort(),module.get_name(),$('#module-select',this.module_tools));

        if (module.shared) {
            $('#delete-module',this.module_tools).removeClass('jade-tool-enabled');
            $('#delete-module',this.module_tools).addClass('jade-tool-disabled');
        } else {
            $('#delete-module',this.module_tools).removeClass('jade-tool-disabled');
            $('#delete-module',this.module_tools).addClass('jade-tool-enabled');
        }

        this.bookmark();    // remember current module for next visit
        this.refresh();  // tell each tab which module we're editing

        // save any changes to the server when we change what we're editing
        jade.model.save_modules();
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

    Jade.prototype.resize = function(w, h) {
        var e = $(this.top_level);

        // adjust target w,h to reflect postion and sizes of padding, borders, margins
        var w_extra = e.outerWidth(true) - e.width();
        var h_extra = e.outerHeight(true) - e.height();
        w -= w_extra;
        h -= h_extra + $('#module-tools').outerHeight(true) + 
            $('.jade-tabs-div',e).outerHeight(true) +
            $('.jade-status',e).outerHeight(true);

        // adjust size of all the tab bodies
        for (var tab in this.tabs) {
            var ediv = this.tabs[tab][1]; // [tab div, body div]
            e = $(ediv);

            w_extra = e.outerWidth(true) - e.width();
            h_extra = e.outerHeight(true) - e.height();

            var tw = w - w_extra;
            var th = h - h_extra;
            e.width(tw);
            e.height(th);

            // inform associated editor about its new size
            ediv.editor.resize(tw, th, tab == this.selected_tab);
        }
    };

    //////////////////////////////////////////////////////////////////////
    //
    // Module tools
    //
    //////////////////////////////////////////////////////////////////////

    function edit_module(j) {
        var offset = $('.jade-tabs-div',j.top_level).offset();

        var content = $('<div style="margin:10px;"><div id="msg" style="display:none;color:red;margin-bottom:10px;"></div></div>');
        content.append('Module name:');
        var input = build_input('text',10,'');
        $(input).css('vertical-align','middle');
        content.append(input);

        function edit() {
            var name = $(input).val();
            // force module names to be a pathname, in /user by default
            if (name[0] != '/') name = '/user/'+name;

            function try_again(msg) {
                $('#msg',content).text(msg);
                $('#msg',content).show();
                dialog('Edit Module',content,edit,offset);
            }

            // make sure name is legit
            var valid = true;
            $.each(name.split('/'),function (index,n) {
                if (!jade.utils.validate_name(n)) valid = false;
            });
            if (!valid) {
                try_again('Invalid module name: '+name);
                return;
            }

            var module = jade.model.find_module(name);
            jade.model.save_modules(true);
            j.edit(module.get_name());
        }

        dialog('Edit Module',content,edit,offset);
    }

    function delete_module(j) {
        var offset = $('.jade-tabs-div',j.top_level).offset();

        var content = $('<div style="margin:10px;width:300px;">Click OK to confirm the deletion of module <span id="mname"></span>.  Note that this action cannot be undone.</div>');
        $('#mname',content).text(j.module.get_name());

        function del() {
            var module = j.module;
            jade.model.remove_module(module.name);
            jade.model.save_modules(true);

            // choose something else to edit
            j.edit(jade.model.find_module('/user/untitled'));
        }

        dialog('Delete Module',content,del,offset);
    }

    function copy_module(j) {
        var offset = $('.jade-tabs-div',j.top_level).offset();
        
        var content = $('<div style="margin:10px;"><div id="msg" style="display:none;color:red;margin-bottom:10px;"></div></div>');
        content.append('New module name:');
        var input = build_input('text',10,'');
        $(input).css('vertical-align','middle');
        content.append(input);

        function copy() {
            var name = $(input).val();
            // force module names to be a pathname, in /user by default
            if (name[0] != '/') name = '/user/'+name;

            function try_again(msg) {
                $('#msg',content).text(msg);
                $('#msg',content).show();
                dialog('Copy Module',content,copy,offset);
            }

            // make sure name is legit
            var valid = true;
            $.each(name.split('/'),function (index,n) {
                if (!jade.utils.validate_name(n)) valid = false;
            });
            if (!valid) {
                try_again('Invalid module name: '+name);
                return;
            }

            if (name in jade.model.get_modules()) {
                try_again('Module already exists: '+name);
                return;
            }

            // make a new module and initialize it using the original
            var module = jade.model.find_module(name,j.module.json());
            // in case we're copying a shared module
            module.shared = false;
            module.remove_property('readonly');
            module.set_modified();   // since it hasn't been saved yet
            jade.model.save_modules(true);

            // select new module for editing
            j.edit(module);
        }

        dialog('Copy Module',content,copy,offset);
    }

    // add our non-shared modules to localStorage
    function download_modules(j) {
        var saved_modules = JSON.parse(localStorage.getItem('jade_saved_modules') || "{}");
        $.extend(saved_modules,jade.model.json_modules().json);
        localStorage.setItem('jade_saved_modules',JSON.stringify(saved_modules));
    };

    function upload_modules(j,event) {
        if (event && event.shiftKey) {
            var content = $('<div style="margin:10px;"><textarea rows="5" cols="80"/></div>');
            var offset = $('.jade-tabs-div',j.top_level).offset();

            function load_answer() {
                var s = eval($('textarea',content).val());
                var edx_state = JSON.parse(s).state;
                var design = JSON.parse(edx_state).state;
                jade.model.load_json(design);
                var modules = Object.keys(design);
                j.edit(modules[0]);
                console.log(modules);
            }

            dialog('Load student answer',content,load_answer,offset);
            return;
        }

        // get modules from localStorage
        var modules = JSON.parse(localStorage.getItem('jade_saved_modules') || '{}');
        var mnames = Object.keys(modules).sort();

        // build checkbox selector for each available module
        var select = [];
        $.each(mnames,function (index,mname) {
            var cbox = $('<input type="checkbox" value=""></input>').attr('name',mname);
            select.push($('<div class="jade-module-select"></div>').append(cbox,mname));
        });

        // build a dialog using up to 3 columns to list modules
        var row = $('<tr valign="top"></tr>');
        var ncols = Math.max(3,Math.ceil(select.length/10));
        var select_all = $('<td><a href="">Select all</a></td>');
        select_all.attr('colspan',ncols.toString());
        var nitems = Math.ceil(select.length/ncols);
        var col,index=0,i;
        while (ncols--) {
            col = $('<td></td>');
            for (i = 0; i < nitems; i += 1)
                col.append(select[index++]);
            row.append(col);
        }
        var contents = $('<table></table>').append(row,$('<tr align="center"></tr>').append(select_all));

        // implement select all functionality
        $('a',select_all).on('click',function (event) {
            $('input',row).prop('checked',true);
            event.preventDefault();
            return false;
        });

        // find checked items and load them
        function upload () {
            $.each(select,function (index,item) {
                var input = $('input',item);
                var mname = input.attr('name');
                if (input[0].checked) {
                    //console.log(mname + ' is checked');
                    jade.model.find_module(mname,modules[mname]);
                }
            });

            jade.model.save_modules(true);
            j.edit(j.module);  // trigger rebuild of module list
        }

        // let user choose
        var offset = $('.jade-tabs-div',j.top_level).offset();
        dialog('Select modules to load',contents,upload,offset);
    };

    function start_over(j) {
        function restart() {
            delete j.configuration.state;
            delete j.configuration.tests;
            j.initialize(j.configuration);
            jade.model.save_modules(true);
        }

        var offset = $('.jade-tabs-div',j.top_level).offset();
        dialog('Start over?',
               $('<span>Click OK to discard all work on this problem and start over again.</span>'),
               restart,offset);
    }

    /*
    function copy_library(diagram) {
        var j = diagram.editor.jade;
        var offset = j.settings.offset();
        j.settings.toggle();   // all done with settings pop-up
        
        var content = $('<div style="margin:10px;"><div id="msg" style="display:none;color:red;margin-bottom:10px;"></div></div>');
        content.append('New library name:');
        var input = build_input('text',10,'library');
        $(input).css('vertical-align','middle');
        content.append(input);

        function copy() {
            var lib = $(input).val();

            function try_again(msg) {
                $('#msg',content).text(msg);
                $('#msg',content).show();
                dialog('Copy Library',content,copy,offset);
            }

            // load/make the requested library
            lib = jade.model.load_library(lib);

            if (Object.keys(lib.modules).length != 0 || lib.read_only) {
                try_again('Library already exists: '+lib.name);
                return;
            }

            // grab json representation of current library
            var module = diagram.aspect.module;
            var json = module.library.json();

            // update instances of lib's modules to instances
            // of the module in the new library.
            // iterate through each module in library
            var cur_lib_name = module.library.name;
            var new_lib_name = lib.name;
            $.each(json,function (mname,mod) {
                if (mod.schematic) {
                    // iterate through each schematic component
                    $.each(mod.schematic,function (index,component) {
                        // if component is an instance of a module in the current
                        // library, update it to be an instance of the same
                        // module in the new library
                        var type = component[0].split(':');
                        if (type.length == 2 && type[0] == cur_lib_name)
                            component[0] = new_lib_name + ':' + type[1];
                    });
                }
            });

            // now load updated json into new library
            lib.load(json);
            jade.save_to_server(lib);   // save new library to server

            // find current module in new library and edit that!
            module = lib.module(module.name);
            j.edit(module.get_name());
        }

        dialog('Copy Library',content,copy,offset);
    }
     */

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
        this.pixelRatio = 1; //devicePixelRatio / backingStoreRatio;

        this.sctl_r = 16; // scrolling control parameters
        this.sctl_x = this.sctl_r + 8; // upper left
        this.sctl_y = this.sctl_r + 8;
        this.zctl_left = this.sctl_x - 8;
        this.zctl_top = this.sctl_y + this.sctl_r + 8;

        // ethanschoonover.com
        this.background_style = 'rgb(250,250,250)'; // backgrund color for diagram [base3]
        this.grid_style = 'rgb(230,230,230)'; // grid on background
        this.control_style = 'rgb(0,0,0)'; // grid on background [base1]
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

    // fetch attributes from the tag that created us
    Diagram.prototype.getAttribute = function(attr) {
        return undefined;
    };

    Diagram.prototype.set_aspect = function(aspect) {
        this.aspect = aspect;
        this.show_grid = true;
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
        this.editor.diagram_changed(this);
        this.redraw_background();
    };

    Diagram.prototype.zoomin = function() {
        var nscale = this.scale * this.zoom_factor;

        if (nscale < this.zoom_max) {
            // keep center of view unchanged
            this.origin_x += ($(this.canvas).width() / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.origin_y += ($(this.canvas).height() / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.scale = nscale;
            this.redraw_background();
        }
    };

    Diagram.prototype.zoomout = function() {
        var nscale = this.scale / this.zoom_factor;

        if (nscale > this.zoom_min) {
            // keep center of view unchanged
            this.origin_x += (this.canvas.width / 2) * (1.0 / this.scale - 1.0 / nscale);
            this.origin_y += (this.canvas.height / 2) * (1.0 / this.scale - 1.0 / nscale);
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
            var scale_x = this.canvas.width / diagram_w;
            var scale_y = this.canvas.height / diagram_h;
            this.scale = Math.pow(this.zoom_factor,
                                  Math.ceil(Math.log(Math.min(scale_x, scale_y)) / Math.log(this.zoom_factor)));
            if (this.scale < this.zoom_min) this.scale = this.zoom_min;
            else if (this.scale > this.zoom_max) this.scale = this.zoom_max;
        }

        // center the diagram
        this.origin_x = (this.bbox[2] + this.bbox[0]) / 2 - this.canvas.width / (2 * this.scale);
        this.origin_y = (this.bbox[3] + this.bbox[1]) / 2 - this.canvas.height / (2 * this.scale);

        this.redraw_background();
    };

    function diagram_toggle_grid(diagram) {
        diagram.show_grid = !diagram.show_grid;
        diagram.redraw_background();
    }

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
        diagram.editor.diagram_changed(diagram);

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

    function diagram_paste(diagram,keystroke) {
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

        // for keystroke, position relative to cursor
        // for toolbar button, position relative to original location
        var px = keystroke ? diagram.cursor_x : left + 16;
        var py = keystroke ? diagram.cursor_y : top + 16;

        // make clones of components on the clipboard, positioning
        // them relative to the cursor
        diagram.aspect.start_action();
        for (i = clipboard.length - 1; i >= 0; i -= 1) {
            c = clipboard[i];
            var new_c = c.clone(px + (c.coords[0] - left), py + (c.coords[1] - top));
            new_c.set_select(true);
            new_c.add(diagram.aspect);
        }
        diagram.aspect.end_action();
        diagram.editor.diagram_changed(diagram);

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
        this.editor.diagram_changed(this);
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
        var w = parseFloat($(this.canvas).css('width'));
        var h = parseFloat($(this.canvas).css('height'));

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
        c.fillStyle = this.show_grid ? this.background_style : 'white';
        c.fillRect(0, 0, this.bg_image.width, this.bg_image.height);

        if (!this.diagram_only && this.show_grid) {
            // grid
            c.strokeStyle = this.grid_style;
            var first_x = this.origin_x;
            var last_x = first_x + this.bg_image.width / this.scale;
            var first_y = this.origin_y;
            var last_y = first_y + this.bg_image.height / this.scale;
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

        // show name of module in lower right corner
        if (this.aspect && this.aspect.module) {
            var name = this.aspect.module.get_name();
            //if (this.aspect.read_only()) name += ' (read only)';
            c.textAlign = 'left';
            c.textBaseline = 'bottom';
            c.font = '12pt sans-serif';
            c.fillStyle = this.normal_style;
            c.fillText(name, 2, this.canvas.height - 2);
        }

        this.redraw(); // background changed, redraw on screen
    };

    // redraw what user sees = static image + dynamic parts
    Diagram.prototype.redraw = function() {
        var c = this.canvas.getContext('2d');
        this.c = c;

        c.lineCap = 'round';

        // put static image in the background.  Make sure we don't scale twice!
        c.drawImage(this.bg_image, 0, 0, this.bg_image.width/this.pixelRatio, this.bg_image.height/this.pixelRatio);

        // selected components
        this.bbox = this.aspect.selected_bbox(this.unsel_bbox);
        if (this.bbox[0] == Infinity) this.bbox = [0, 0, 0, 0];

        var diagram = this; // for closure below
        this.aspect.map_over_components(function(c) {
            if (c.selected) c.draw(diagram);
        });

        // connection points: draw one at each location
        for (var location in this.aspect.connection_points) {
            var cplist = this.aspect.connection_points[location];
            cplist[0].draw(this, cplist.length);
        }

        // draw editor-specific dodads, enable appropriate tools
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

        // ignore modifier keys (shift, ctrl, alt, caps lock, window/cmd keys)
        if (code==16 || code==17 || code==18 || code==20 || code==91 || code==92)
            return true;

        // cmd/ctrl a: select all
        if ((event.ctrlKey || event.metaKey) && code == 65) {
            this.aspect.map_over_components(function(c) {
                c.set_select(true);
            });
            this.redraw_background();
        }

        // cmd/ctrl c: copy
        else if ((event.ctrlKey || event.metaKey) && code == 67) {
            diagram_copy(this);
        }

        // after this point commands require permission to change diagram
        else if (this.aspect.read_only()) return true;

        // backspace or delete: delete selected components
        else if (code == 8 || code == 46) {
            // delete selected components
            this.aspect.start_action();
            this.aspect.map_over_components(function(c) {
                if (c.selected) c.remove();
            });
            this.aspect.end_action();
            this.editor.diagram_changed(this);
            this.redraw_background();
        }

        // cmd/ctrl c: copy
        else if ((event.ctrlKey || event.metaKey) && code == 67) {
            diagram_copy(this);
        }

        // cmd/ctrl v: paste
        else if ((event.ctrlKey || event.metaKey) && code == 86) {
            diagram_paste(this,true);
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
                if (temp > this.origin_min * this.grid && temp < this.origin_max * this.grid)
                    this.origin_y = temp;
            }
            else { // E or W
                delta = this.canvas.width / (8 * this.scale);
                if (sx < 0) delta = -delta;
                temp = this.origin_x + delta;
                if (temp > this.origin_min * this.grid && temp < this.origin_max * this.grid)
                    this.origin_x = temp;
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
                    if (!diagram.aspect.read_only()) {
                        diagram.aspect.start_action();
                        diagram.drag_begin();
                    }
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
        } else if (!this.dragging) {
            // shift-click on background starts a pan
            this.panning = true;
            this.set_cursor_grid(1);
            this.drag_x = this.cursor_x;
            this.drag_y = this.cursor_y;
            $(this.canvas).addClass('jade-panning');
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
        else if (this.panning) {
            // see how far we moved
            var dx = this.cursor_x - this.drag_x;
            var dy = this.cursor_y - this.drag_y;
            if (dx !== 0 || dy !== 0) {
                // update position for next time
                this.drag_x = this.cursor_x;
                this.drag_y = this.cursor_y;

                var nx = this.origin_x - dx;
                var ny = this.origin_y - dy;
                if (nx > this.origin_min * this.grid && nx < this.origin_max * this.grid &&
                    ny > this.origin_min * this.grid && ny < this.origin_max * this.grid) {
                    this.origin_x = nx;
                    this.origin_y = ny;
                    this.drag_x -= dx;   // update drag coords to reflect new origin
                    this.drag_y -= dy;
                    this.redraw_background();
                }
            }
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
                jade.model.canonicalize(s);

                if (!shiftKey) this.unselect_all();

                // select components that intersect selection rectangle
                this.aspect.map_over_components(function(c) {
                    c.select_rect(s, shiftKey);
                });
            }

            this.select_rect = undefined;
            this.redraw_background();
        }

        if (this.panning) {
            this.panning = false;
            $(this.canvas).removeClass('jade-panning');
        }
    };

    Diagram.prototype.message = function(message) {
        var status = this.editor.status;

        if (status) status.html(message);
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

    // build simple progress bar with stop button
    function progress_report() {
        var progress = $('<div class="jade-progress"><div class="jade-progress-wrapper"><div class="jade-progress-bar" style="width:0%"></div></div><button id="stop">Stop</button></div>');

        // call to update progress bar
        progress[0].update_progress = function (percent) {
            progress.find('.jade-progress-bar').css('width',percent+'%');
        };

        var stop = progress.find('#stop');
        stop.on('click',function(event) {
            progress[0].stop_requested = true;
            event.preventDefault();
            return false;
        });
        return progress;
    }

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
            if (!f.hasClass('newline-allowed')) {
                f.keypress(function (event) {
                    if (event.keyCode == 13) dialog.find('#ok').trigger('click');
                });
            }

            // select entire contents of <input> when it gets focus
            f.focus(function () {
                f.select();
            });
        });

        // fill in body element, set up click handlers
        dialog.find('.jade-dialog-content').append(content);

        dialog.find('#ok').on('click',function (event) {
            window_close(dialog[0].win);

            // invoke the callback with the dialog contents as the argument.
            // small delay allows browser to actually remove window beforehand
            if (dialog[0].callback) setTimeout(function() {
                dialog[0].callback();
            }, 1);

            event.preventDefault();
            return false;
        });

        dialog.find('#cancel').on('click',function (event) {
            window_close(dialog[0].win);
            event.preventDefault();
            return false;
        });

        // put into an overlay window
        jade_window(title, dialog[0], offset);

        // give initial focus to first property's <input> 
        if (focus) focus.focus();
    };

    // build a 2-column HTML table from an associative array (keys as text in
    // column 1, values in column 2).
    function build_table(a) {
        var tbl = $('<table><tbody></tbody></table>');

        // build a row for each element in associative array
        for (var i in a) {
            var row = $('<tr valign="center"><td><nobr>'+i+':</nobr></td><td id="field"></td></tr>');
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
        var input;
        if (type == 'text' || type == 'string') {
            input = $('<textarea class="property" autocorrect="off" autocapitalize="off" rows="1"></textarea>');
            if (type == 'string') input.addClass('newline-allowed');
        } else {
            input = $('<input class="property" autocorrect="off" autocapitalize="off"></input>').attr('type',type).attr('size',size);
        }
        input.val(value === undefined ? '' : value.toString());
        return input[0];
    }

    // build a select widget using the strings found in the options array
    function build_select(options, selected, select) {
        if (select === undefined) select = $('<select></select>');
        else select = $(select);
        select.empty();
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
                    ' <div class="jade-window-title">' + title + '<span style="float:right;cursor: pointer">'+jade.icons.close_icon + '</span></div>' + //'<img style="float: right"></img></div>' +
                    '</div>');
        win[0].content = content;
        win[0].drag_x = undefined;
        win[0].draw_y = undefined;

        var head = win.find('.jade-window-title').mousedown(window_mouse_down);
        head[0].win = win[0];
        win[0].head = head[0];

        var close_button = win.find('span').click(function (event) {
            window_close(win[0]);
            event.preventDefault();
            return false;
        });

        win.append($(content));
        content.win = win[0]; // so content can contact us
        $(content).toggleClass('jade-window-contents');

        if (content.resize) {
            var resize = $('<div class="jade-window-resize"></div>');
            resize.append($(jade.icons.resize_icon).css('pointer-events','none'));
            resize[0].win = win[0];
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
        if (offset) win.offset(offset);
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
            $(window_list[i]).css('z-index',100 + i);
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
    function window_mouse_down(e) {
        var event = window.event || e;
        var doc = $(document).get(0);
        var win = event.target.win;
        bring_to_front(win, true);

        // remember where mouse is so we can compute dx,dy during drag
        var drag_x = event.pageX;
        var drag_y = event.pageY;

        function move(event) {
            var dx = event.pageX - drag_x;
            var dy = event.pageY - drag_y;

            // update reference point
            drag_x += dx;
            drag_y += dy;

            // move window by dx,dy
            var offset = $(win).offset();
            if (offset) {
                offset.top += dy;
                offset.left += dx;
                $(win).offset(offset);
            }

            return false;
        }

        function up(event) {
            doc.removeEventListener('mousemove',move,true);
            doc.removeEventListener('mouseup',up,true);
            return false; // consume event
        }

        // add handlers to document so we capture them no matter what
        doc.addEventListener('mousemove',move,true);
        doc.addEventListener('mouseup',up,true);

        return false;
    }

    function window_resize_start(event) {
        var win = event.target.win;
        var lastX = event.pageX;
        var lastY = event.pageY;
        var doc = $(document).get(0);

        function move(e) {
            var event = window.event || e;
            win.resize(event.pageX - lastX, event.pageY - lastY);
            lastX = event.pageX;
            lastY = event.pageY;
            return false;
        };

        function up(event) {
            doc.removeEventListener('mousemove',move,true);
            doc.removeEventListener('mouseup',up,true);
            return false; // consume event
        };

        doc.addEventListener('mousemove',move,true);
        doc.addEventListener('mouseup',up,true);

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
        this.toolbar = $('<div class="jade-toolbar noselect"></div>');
    }

    Toolbar.prototype.add_tool = function(tname, icon, tip, handler, enable_check) {
        var tool;
        if (icon.search('data:image') != -1) {
            tool = $('<img draggable="false"></img>');
            tool.attr('src',icon);
        }
        else {
            tool = $('<button></button>').append(icon);
        }
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
            if (which != tool[0].enabled) {
                tool[0].enabled = which;
                tool.toggleClass('jade-tool-disabled', !which);
                tool.toggleClass('jade-tool-enabled', which);
            }
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

        event.preventDefault();
        return false;
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////

    return {
        Jade: Jade,
        Diagram: Diagram,
        diagram_toggle_grid: diagram_toggle_grid,
        diagram_undo: diagram_undo,
        diagram_redo: diagram_redo,
        diagram_cut: diagram_cut,
        diagram_copy: diagram_copy,
        diagram_paste: diagram_paste,
        diagram_fliph: diagram_fliph,
        diagram_flipv: diagram_flipv,
        diagram_rotcw: diagram_rotcw,
        diagram_rotccw: diagram_rotccw,

        Toolbar: Toolbar,
        Jade: Jade,

        editors: editors,
        clipboards: clipboards,

        build_table: build_table,
        build_button: build_button,
        build_input: build_input,
        build_select: build_select,
        progress_report: progress_report,
        dialog: dialog,
        window: jade_window,
        window_close: window_close
    };

};

// check for leaking globals by comparing the top-level environment
// of our window with that of a blank iframe
jade_defs.global_check = function () {
    var ignoreList = "$,jQuery,jade_defs".split(',');

    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.src = 'about:blank';
    iframe = iframe.contentWindow || iframe.contentDocument;

    var differences = [];
    for (var i in window) {
        if (typeof iframe[i] != 'undefined') continue;
        if (ignoreList.indexOf(i) != -1) continue;
        differences.push(i);
    }
    return differences;
};

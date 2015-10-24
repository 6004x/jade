// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.test_view = function(jade) {

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

     // simulation mode is either "device" or "gate"
     .mode gate

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

    jade.schematic_view.schematic_tools.push(['check',
                                              jade.icons.check_icon,
                                              'Check: run tests',
                                              do_test]);

    function do_test(diagram) {
        var module = diagram.aspect.module;
        if (module) {
            if (module.has_aspect('test')) {
                var test = module.aspect('test').components[0];
                if (test) {
                    run_tests(test.test,diagram,module);

                    // save (partial) results to server
                    jade.model.save_modules(true);

                    // redraw diagram to show any changes in highlighting
                    diagram.redraw_background();
                    return;
                }
            }
        }

        diagram.message('This module does not have a test!');
    }

    function TestEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;
        this.aspect = undefined;
        this.test_component = undefined;
        this.tab = div.tab;

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

    TestEditor.prototype.resize = function(w, h, selected) {
        var e = this.textarea;

        var w_extra = e.outerWidth(true) - e.width();
        var h_extra = e.outerHeight(true) - e.height();
        
        var tw = w -  w_extra;
        var th = h - h_extra;
        e.width(tw);
        e.height(th);
    };

    TestEditor.prototype.show = function() {};

    TestEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.aspect = module.aspect('test');
        this.test_component = this.aspect.components[0];
        if (this.test_component === undefined) {
            this.test_component = jade.model.make_component(["test",""]);
            this.aspect.add_component(this.test_component);
        }
        this.textarea.val(this.test_component.test);

        $(this.tab).html(TestEditor.prototype.editor_name);

        if (this.aspect.read_only()) {
            this.textarea.attr('disabled','disabled');
            $(this.tab).append(' ' + jade.icons.readonly);
        } else {
            this.textarea.removeAttr('disabled');
        }
    };

    TestEditor.prototype.event_coords = function () { };

    TestEditor.prototype.check = function () {
        run_tests(this.textarea.val(),this,this.module);
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
        jade.model.Component.call(this);
        this.load(json);
    }
    Test.prototype = new jade.model.Component();
    Test.prototype.constructor = Test;
    Test.prototype.type = function () { return 'test'; };
    jade.model.built_in_components.test = Test;

    Test.prototype.load = function(json) {
        this.test = json[1];
    };

    Test.prototype.json = function() {
        return [this.type(), this.test];
    };

    function parse_plot(line,errors) {
        // .plot sig sig ...
        // sig is signal name or dfunction(sig [,] sig ...)
        var j,k;
        var dfunction,siglist,okay,name;
        var plist = [];
        j = 0;
        while (j < line.length) {
            if (j+1 < line.length && line[j+1] == '(') {
                // parse dfunction(sig [,] sig ...)
                dfunction = line[j];
                j += 2;
                siglist = [];
                name = dfunction+'(';
                okay = false;
                while (j < line.length) {
                    if (line[j] == ')') { name += ')'; okay = true; break; }
                    if (name[name.length - 1] != '(') name += ',';
                    name += line[j];
                    $.each(jade.utils.parse_signal(line[j]), function (index,sig) {
                        siglist.push(sig);
                    });
                    j += 1;
                    if (j < line.length && line[j] == ',') j += 1;
                }
                if (!okay) errors.push('Missing ) in .plot statement: '+line.join(' '));
                else plist.push({signals: siglist, dfunction: dfunction, name: name});
            } else {
                $.each(jade.utils.parse_signal(line[j]), function (index,sig) {
                    plist.push({signals: [sig], dfunction: undefined, name: sig});
                });
            }
            j += 1;
        }
        return plist;
    }

    function run_tests(source,diagram,module) {
        var test_results = diagram.editor.jade.configuration.tests;
        var help_url = diagram.editor.jade.configuration.help_url;
        var student_id = diagram.editor.jade.configuration.student_id;
        test_results[module.get_name()] = 'Error detected: test did not yield a result.';
        var msg;

        var mverify_md5sum;
        var md5sum = jade.utils.md5(source);  // for server-side verification
        jade_defs.md5sum = md5sum;

        // remove multiline comments, in-line comments
        source = source.replace(/\/\*(.|\n)*?\*\//g,'');   // multi-line using slash-star
        source = source.replace(/\/\/.*/g,'');  // single-line comment

        var i,j,k,v;
        var repeat = 1;
        var mode = 'device';  // which simulation to run
        var plots = [];     // list of signals to plot
        var tests = [];     // list of test lines
        var mverify = {};   // mem name -> [value... ]
        var mverify_src = [];   // list of .mverify source lines (used for checksum)
        var power = {};     // node name -> voltage
        var thresholds = {};  // spec name -> voltage
        var cycle = [];    // list of test actions: [action args...]
        var groups = {};   // group name -> list of indicies
        var signals = [];  // list if signals in order that they'll appear on test line
        var driven_signals = {};   // if name in dictionary it will need a driver ckt
        var sampled_signals = {};   // if name in dictionary we want its value
        var plotdefs = {};   // name -> array of string representations for values
        var errors = [];
        var log_signals = [];  // signals to report in each log entry
        var options = diagram.editor.options || {};

        // process each line in test specification
        source = source.split('\n');
        for (k = 0; k < source.length; k += 1) {
            var line = source[k].match(/([A-Za-z0-9_.:\[\]]+|=|-|,|\(|\))/g);
            if (line === null) continue;
            if (line[0] == '.mode') {
                if (line.length != 2) errors.push('Malformed .mode statement: '+source[k]);
                else if (line[1] == 'device' || line[1] == 'gate') mode = line[1]
                else errors.push('Unrecognized simulation mode: '+line[1]);
            }
            else if (line[0] == '.options') {
                // .options name=value name=value ...
                for (i = 1; i < line.length; i += 3) {
                    if (i + 2 >= line.length || line[i+1] != '=') {
                        errors.push('Malformed '+line[0]+' statement: '+source[k]);
                        break;
                    }
                    v = jade.utils.parse_number(line[i+2]);
                    if (isNaN(v)) {
                        errors.push('Unrecognized option value "'+line[i+2]+'": '+source[k]);
                        break;
                    }
                    options[line[i].toLowerCase()] = v;
                }
            }
            else if (line[0] == '.power' || line[0] == '.thresholds') {
                // .power/.thresholds name=float name=float ...
                for (i = 1; i < line.length; i += 3) {
                    if (i + 2 >= line.length || line[i+1] != '=') {
                        errors.push('Malformed '+line[0]+' statement: '+source[k]);
                        break;
                    }
                    v = jade.utils.parse_number(line[i+2]);
                    if (isNaN(v)) {
                        errors.push('Unrecognized voltage specification "'+line[i+2]+'": '+source[k]);
                        break;
                    }
                    if (line[0] == '.power') power[line[i].toLowerCase()] = v;
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
                        $.each(jade.utils.parse_signal(line[j]),function (index,sig) {
                            // remember index of this signal in the signals list
                            groups[line[1]].push(signals.length);
                            // keep track of signal names
                            signals.push(sig);
                        });
                    }
                }
            }
            else if (line[0] == '.plotdef') {
                line = source[k].split(/\s+/);  // reparse as whitespace-separated text
                // .plotdef name val0 val1 ...
                if (line.length < 3) {
                    errors.push('Malformed .plotdef statement: '+source[k]);
                } else {
                    plotdefs[line[1]] = line.slice(2);
                }
            }
            else if (line[0] == '.plot') {
                plots.push(parse_plot(line.slice(1),errors));
            }
            else if (line[0] == '.cycle') {
                // .cycle actions...
                //   assert <group_name>
                //   deassert <group_name>
                //   sample <group_name>
                //   tran <duration>
                //   log
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
                        v = jade.utils.parse_number(line[i+1]);
                        if (isNaN(v)) {
                            errors.push('Unrecognized tran duration "'+line[i+1]+'": '+source[k]);
                            break;
                        }
                        cycle.push(['tran',v]);
                        i += 2;
                        continue;
                    }
                    else if (line[i] == 'log') {
                        cycle.push(['log']);
                        i += 1;
                        continue;
                    }
                    else if (line[i+1] == '=' && (i + 2 < line.length)) {
                        v = line[i+2];   // expect 0,1,Z
                        if ("01Z".indexOf(v) == -1) {
                            errors.push('Unrecognized value specification "'+line[i+2]+'": '+source[k]);
                            break;
                        }
                        cycle.push(['set',line[i].toLowerCase(),v]);
                        driven_signals[line[i].toLowerCase()] = [[0,'Z']];  // driven node is 0 at t=0
                        i += 3;
                        continue;
                    }
                    errors.push('Malformed .cycle action "'+line[i]+'": '+source[k]);
                    break;
                }
            }
            else if (line[0] == '.repeat') {
                repeat = parseInt(line[1]);
                if (isNaN(repeat) || repeat < 1) {
                    errors.push('Expected positive integer for .repeat: '+line[1]);
                    repeat = 1;
                }
            }
            else if (line[0] == '.log') {
                // capture signal names for later printout
                for (j = 1; j < line.length; j += 1) {
                    $.each(jade.utils.parse_signal(line[j]),function (index,sig) {
                        log_signals.push(sig);
                    });
                }
            }
            else if (line[0] == '.mverify') {
                // .mverify mem_name locn value...
                if (line.length < 4)
                    errors.push("Malformed .mverify statement: "+source[k]);
                else {
                    var locn = parseInt(line[2]);
                    if (isNaN(locn)) {
                        errors.push('Bad location "'+line[2]+'" in .mverify statement: '+source[k]);
                    } else {
                        var a = mverify[line[1].toLowerCase()];
                        if (a === undefined) {
                            a = [];
                            mverify[line[1].toLowerCase()] = a;
                        }
                        for (j = 3; j < line.length; j += 1) {
                            v = parseInt(line[j]);
                            if (isNaN(v)) {
                                errors.push('Bad value "'+line[j]+'" in .mverify statement: '+source[k]);
                            } else {
                                // save value in correct location in array
                                // associated with mem_name
                                a[locn] = v;
                                locn += 1;
                            }
                        }
                        mverify_src.push(source[k]);  // remember source line for checksum
                    }
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
                // repeat the test the request number of times, leave repeat at 1
                while (repeat--) tests.push(test);
                repeat = 1;
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
            msg = '<li>'+errors.join('<li>');
            jade.window('Errors in test specification',
                        $('<div class="jade-alert"></div>').html(msg),
                        $(diagram.canvas).offset());
            //diagram.message('The following errors were found in the test specification:'+msg);
            test_results[module.get_name()] = 'Error detected: invalid test specification'+msg;
            return;
        }

        //console.log('power: '+JSON.stringify(power));
        //console.log('thresholds: '+JSON.stringify(thresholds));
        //console.log('groups: '+JSON.stringify(groups));
        //console.log('cycle: '+JSON.stringify(cycle));
        //console.log('tests: '+JSON.stringify(tests));

        // extract netlist and make sure it has the signals referenced by the test
        if (!module.has_aspect('schematic')) {
            diagram.message('This module does not have a schematic!');
            test_results[module.get_name()] = 'Error detected: this module has no schematic!';
            return;
        }

        var netlist;
        try {
            var globals = Object.getOwnPropertyNames(power);  // all the power supplies are global
            globals.push('gnd');
            if (mode == 'device')
                netlist = jade.device_level.diagram_device_netlist(diagram,globals);
            else if (mode == 'gate')
                netlist = jade.gate_level.diagram_gate_netlist(diagram,globals);
            else
                throw 'Unrecognized simulation mode: '+mode;
        }
        catch (e) {
            if (e.stack) console.log(e.stack);
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            //diagram.message("Error extracting netlist:<p>" + e);
            test_results[module.get_name()] = 'Error detected extracting netlist:<p>'+e;
            return;
        }

        var nodes = jade.netlist.extract_nodes(netlist);  // get list of nodes in netlist
        function check_node(node) {
            if (!(node in driven_signals) && nodes.indexOf(node) == -1)
                errors.push('There are no devices connected to node "'+node+'".');
        }
        $.each(driven_signals,check_node);
        $.each(sampled_signals,check_node);
        $.each(log_signals,function (index,n) { check_node(n); });

        if (errors.length != 0) {
            msg = '<li>'+errors.join('<li>');
            jade.window('Errors in test specification',
                        $('<div class="jade-alert"></div>').html(msg),
                        $(diagram.canvas).offset());
            //diagram.message('The following errors were found in the test specification:'+msg);
            test_results[module.get_name()] = 'Error detected:'+msg;
            return;
        }

        // ensure simulator knows what gnd is
        netlist.push({type: 'ground',connections:['gnd'],properties:{}});

        // add voltage sources for power supplies
        $.each(power,function(node,v) {
            netlist.push({type:'voltage source',
                          connections:{nplus:node, nminus:'gnd'},
                          properties:{value:{type:'dc', args:[v]}, name:node/*+'_source'*/}});
        });

        // go through each test determining transition times for each driven node, adding
        // [t,v] pairs to driven_nodes dict.  v = '0','1','Z'
        var time = 0;
        function set_voltage(tvlist,v) {
            if (v != tvlist[tvlist.length - 1][1]) tvlist.push([time,v]);
        }
        var log_times = [];          // times at which to create log entry
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
                            sampled_signals[signals[sindex]].push({t: time,v: test[sindex],i: tindex+1});
                    });
                }
                else if (action[0] == 'set') {
                    set_voltage(driven_signals[action[1]],action[2]);
                }
                else if (action[0] == 'log') {
                    log_times.push(time);
                }
                else if (action[0] == 'tran') {
                    time += action[1];
                }
            });
        });

        if (mode == 'device')
            build_inputs_device(netlist,driven_signals,thresholds);
        else if (mode == 'gate')
            build_inputs_gate(netlist,driven_signals,thresholds);
        else throw 'Unrecognized simulation mode: '+mode;
        //console.log('stop time: '+time);
        //jade.netlist.print_netlist(netlist);

        function multibit_to_int(dataset) {
            // first merge all the nodes in the dataset into a single
            // set of xvalues and yvalues, where each yvalue is an array of
            // digital values from the component nodes
            var xv = [];
            var yv = [];
            var vil = thresholds.Vil || 0.2;
            var vih = thresholds.Vih || 0.8;
            var nnodes = dataset.xvalues.length;  // number of nodes
            var i,nindex,vindex,x,y,last_y,xvalues,yvalues,nvalues,type;
            for (nindex = 0; nindex < nnodes; nindex += 1) {
                xvalues = dataset.xvalues[nindex];
                yvalues = dataset.yvalues[nindex];
                nvalues = xvalues.length;
                type = dataset.type[nindex];
                i = 0;  // current index into merged values
                last_y = undefined;
                for (vindex = 0; vindex < nvalues; vindex += 1) {
                    x = xvalues[vindex];
                    y = yvalues[vindex];

                    // convert to a digital value if necessary
                    if (type == 'analog') y = (y <= vil) ? 0 : ((y >= vih) ? 1 : 2);

                    // don't bother if node already has this logic value
                    // unless it's the final time point, which we need to keep
                    if (vindex != nvalues-1 && y == last_y) continue;

                    // skip over merged values till we find where x belongs
                    while (i < xv.length) {
                        if (xv[i] >= x) break;
                        // add new bit to time point we're skipping over
                        yv[i][nindex] = last_y;  
                        i += 1;
                    }

                    if (xv[i] == x) {
                        // exact match of time with existing time point, so just add new bit
                        yv[i][nindex] = y;
                    } else {
                        // need to insert new time point, copy previous time point, if any
                        // otherwise make a new one from scratch
                        var new_value;
                        if (i > 0) new_value = yv[i-1].slice(0);  // copy previous one
                        else new_value = new Array();
                        new_value[nindex] = y;
                        // insert new time point into xv and yv arrays
                        xv.splice(i,0,x);
                        yv.splice(i,0,new_value);
                    }

                    // all done! move to next value to merge
                    last_y = y;    // needed to fill in entries we skip over
                }

                // propagate final value through any remaining elements
                while (i < xv.length) {
                    // add new bit to time point we're skipping over
                    yv[i][nindex] = last_y;  
                    i += 1;
                }
            }

            // convert the yv's to integers or undefined, then format as specified
            for (vindex = 0; vindex < yv.length; vindex += 1) {
                yvalues = yv[vindex];
                y = 0;
                for (nindex = 0; nindex < nnodes; nindex += 1) {
                    i = yvalues[nindex];
                    if (i === 0 || i == 1) y = y*2 + i;
                    else if (i == 3) y = -1;  // < 0 means Z
                    else { y = undefined; break; }
                }
                yv[vindex] = y;
            }
            dataset.xvalues = xv;
            dataset.yvalues = yv;
            dataset.nnodes = nnodes;
            return dataset;
        }

        // handle results from the simulation
        function process_results(percent_complete,results) {
            if (percent_complete === undefined) {
                jade.window_close(progress[0].win);  // done with progress bar

                if (typeof results == 'string') {
                    // oops, some sort of exception: just report it
                    jade.window('Error running test',
                                $('<div class="jade-alert"></div>').html(results),
                                $(diagram.canvas).offset());
                    //diagram.message(results);
                    test_results[module.get_name()] = 'Error detected: '+results;
                    return undefined;
                } else if (results instanceof Error) {
                    results = results.stack.split('\n').join('<br>');
                    jade.window('Error running test',
                                $('<div class="jade-alert"></div>').html(results),
                                $(diagram.canvas).offset());
                    //diagram.message(results.stack.split('\n').join('<br>'));
                    test_results[module.get_name()] = 'Error detected: '+results.message;
                    return undefined;
                }

                // order test by time
                var tests = [];
                $.each(sampled_signals,function(node,tvlist) {
                    $.each(tvlist,function(index,tvpair) {
                        tests.push({n: node, t: tvpair.t, v: tvpair.v, i: tvpair.i});
                    });
                });
                tests.sort(function(t1,t2) {
                    // sort by time, then by name
                    if (t1.t == t2.t) {
                        if (t1.n < t2.n) return -1;
                        else if (t1.n > t2.n) return 1;
                        else return 0;
                    } else return t1.t - t2.t;
                });

                // check the sampled node values for each test cycle
                var hcache = {};  // cache histories we retrieve
                var errors = [];
                var t_error;
                var v,test,history;
                for (var i = 0; i < tests.length; i += 1) {
                    test = tests[i];

                    // if we've detected errors at an earlier test, we're done
                    // -- basically just report all the errors for the first failing test
                    if (t_error && t_error < test.i) break;

                    // retrieve history for this node
                    history = hcache[test.n];
                    if (history === undefined) {
                        history = results._network_.history(test.n);
                        hcache[test.n] = history;
                    }

                    // check observed value vs. expected value
                    if (mode == 'device') {
                        v = history === undefined ? undefined : jade.device_level.interpolate(test.t, history.xvalues, history.yvalues);
                        if (v === undefined ||
                            (test.v == 'L' && v > thresholds.Vil) ||
                            (test.v == 'H' && v < thresholds.Vih)) {
                            errors.push('Test '+test.i.toString()+': Expected '+test.n+'='+test.v+
                                        ' at '+jade.utils.engineering_notation(test.t,2)+'s.');
                            t_error = test.i;
                        }
                    }
                    else if (mode == 'gate') {
                        v = history === undefined ? undefined : jade.gate_level.interpolate(test.t, history.xvalues, history.yvalues);
                        if (v === undefined ||
                            (test.v == 'L' && v != 0) ||
                            (test.v == 'H' && v != 1)) {
                            errors.push('Test '+test.i.toString()+': Expected '+test.n+'='+test.v+
                                        ' at '+jade.utils.engineering_notation(test.t,2)+'s.');
                            t_error = test.i;
                        }
                    }
                    else throw 'Unrecognized simulation mode: '+mode;
                }

                // perform requested memory verifications
                $.each(mverify,function (mem_name,a) {
                    var mem = results._network_.device_map[mem_name];
                    if (mem === undefined) {
                        errors.push('Cannot find memory named "'+mem_name+'", verification aborted.');
                        return;
                    }
                    mem = mem.get_contents();
                    $.each(a,function (locn,v) {
                        if (v === undefined) return;  // no check for this location
                        if (locn < 0 || locn >= mem.nlocations) {
                            errors.push("Location "+locn.toString()+" out of range for memory "+mem_name);
                        }
                        if (mem[locn] !== v) {
                            var got = mem[locn] === undefined ? 'undefined' : '0x'+mem[locn].toString(16);
                            errors.push(mem_name+"[0x"+locn.toString(16)+"]: Expected 0x"+v.toString(16)+", got "+got);
                        }
                    });
                });
                mverify_md5sum = jade.utils.md5(mverify_src.join('\n'));  // for server-side verification
                jade_defs.mverify_md5sum = mverify_md5sum;

                // create log if requested
                var log = [];
                $.each(log_times,function (tindex,t) {
                    var values = [];
                    $.each(log_signals,function (sindex,n) {
                        // retrieve history for this node
                        var history = hcache[n];
                        if (history === undefined) {
                            history = results._network_.history(n);
                            hcache[n] = history;
                        }
                        if (history === undefined) v = '?';
                        else {
                            v = jade.gate_level.interpolate(t, history.xvalues, history.yvalues);
                            v = "01XZ"[v];
                        }
                        values.push(v);
                    });
                    log.push(values.join(''));
                });
                if (log.length > 0) console.log(log.join('\n'));

                // construct a data set for {signals: [sig...], dfunction: string, name: string}
                var plot_colors = ['#268bd2','#dc322f','#859900','#b58900','#6c71c4','#d33682','#2aa198'];
                function new_dataset(plist) {
                    var xvalues = [];
                    var yvalues = [];
                    var name = [];
                    var color = [];
                    var type = [];
                    var xy,f;
                    var yunits = mode == 'device' ? 'V' : '';
                    $.each(plist,function (pindex,pspec) {
                        if (pspec.dfunction == 'I') {
                            var sig = pspec.signals[0];
                            var isig = 'I(' + sig + ')';
                            var history = results._network_.history(isig);
                            if (history !== undefined) {
                                color.push(plot_colors[xvalues.length % plot_colors.length]);
                                xvalues.push(history.xvalues);
                                yvalues.push(history.yvalues);
                                name.push(isig);
                                type.push(results._network_.result_type());
                                yunits = 'A';
                            } else throw "No voltage source named "+sig;
                        } else if (pspec.dfunction) {
                            // gather history information for each signal
                            var xv = [];  // each element is a list of times
                            var yv = [];  // each element is a list of values
                            var t = [];
                            var fn = pspec.dfunction;
                            $.each(pspec.signals,function (index,sig) {
                                var history = results._network_.history(sig);
                                // deal with dfunction here...
                                if (history !== undefined) {
                                    xv.push(history.xvalues);
                                    yv.push(history.yvalues);
                                    t.push(results._network_.result_type());
                                } else throw "No node named "+sig;
                            });

                            // merge multibit xvalues and yvalues into xvalues and integers
                            xy = multibit_to_int({xvalues: xv, yvalues: yv, type: t});

                            // convert each yvalue to its final representation
                            $.each(xy.yvalues,function (index,y) {
                                if (y !== undefined) {
                                    if (y < 0) {
                                        y = -1;  // indicate Z value for bus
                                    } else if (fn in plotdefs) {
                                        var v = plotdefs[fn][y];
                                        if (v) y = v;
                                        else {
                                            // use hex if for some reason plotDef didn't supply a string
                                            y = "0x" + ("0000000000000000" + y.toString(16)).substr(-Math.ceil(xy.nnodes/4));
                                        }
                                    } else if (fn == 'X' || fn == 'x') {  // format as hex number
                                        y = "0x" + ("0000000000000000" + y.toString(16)).substr(-Math.ceil(xy.nnodes/4));
                                    } else if (fn == 'O' || fn == 'o') {  // format as octal number
                                        y = "0" + ("0000000000000000000000" + y.toString(8)).substr(-Math.ceil(xy.nnodes/3));
                                    } else if (fn == 'B' || fn == 'b') {  // format as binary number
                                        y = "0b" + ("0000000000000000000000000000000000000000000000000000000000000000" + y.toString(2)).substr(-Math.ceil(xy.nnodes));
                                    } else if (fn == 'D' || fn == 'd') {  // format as decimal number
                                        y = y.toString(10);
                                    } else if (fn == 'SD' || fn == 'sd') {  // format as signed decimal number
                                        if (y & 1<<(xy.nnodes - 1)) y -= 1 << xy.nnodes;
                                        y = y.toString(10);
                                    } else throw "No definition for plot function "+fn;
                                    xy.yvalues[index] = y;
                                }
                            });
                            color.push(plot_colors[xvalues.length % plot_colors.length]);
                            xvalues.push(xy.xvalues);
                            yvalues.push(xy.yvalues);
                            name.push(pspec.name);
                            type.push('string');
                            yunits = '';
                        } else {
                            $.each(pspec.signals,function (index,sig) {
                                var history = results._network_.history(sig);
                                // deal with dfunction here...
                                if (history !== undefined) {
                                    color.push(plot_colors[xvalues.length % plot_colors.length]);
                                    xvalues.push(history.xvalues);
                                    yvalues.push(history.yvalues);
                                    name.push(sig);
                                    type.push(results._network_.result_type());
                                } else throw "No node named "+sig;
                            });
                        }
                    });
                        
                    if (xvalues.length > 0) {
                        return {xvalues: xvalues,
                                yvalues: yvalues,
                                name: name,
                                xunits: 's',
                                yunits: yunits,
                                color: color,
                                type: type
                               };
                    } else return undefined;
                }

                // called by plot.graph when user wants to plot another signal
                function add_plot(signal) {
                    try {
                        // construct data set for requested signal
                        var line = signal.match(/([A-Za-z0-9_.:\[\]]+|=|-|,|\(|\))/g);
                        var errors = [];
                        var plist = parse_plot(line,errors);
                        if (errors.length > 0)
                            throw '<li>'+errors.join('<li>');
                        var dataset = new_dataset(plist);
                        if (dataset) dataseries.push(dataset);
                    } catch (e) {
                        jade.window("Error in Add Plot",
                                    $('<div class="jade-alert"></div>').html(e),
                                    offset);
                    }
                }

                // produce requested plots
                var offset = $(diagram.canvas).offset();
                if (plots.length > 0) {
                    var dataseries = []; // plots we want
                    $.each(plots,function(index,plist) {
                        try {
                            var dataset = new_dataset(plist);
                        } catch (e) {
                            errors.push(e);
                        }
                        if (dataset) dataseries.push(dataset);
                    });

                    // callback to use if user wants to add a new plot
                    dataseries.add_plot = add_plot;  

                    // graph the result and display in a window
                    var graph1 = jade.plot.graph(dataseries);

                    // provide option for a brief report of stats, if supported
                    if (results.report) {
                        var b = $('<button style="margin-left:10px">Stats</button>');
                        b.on('click',function () {
                            var offset = $(diagram.canvas).offset();
                            offset.top += 30;
                            offset.left += 30;
                            jade.window('Circuit statistics',results.report(),offset);
                        });
                        $('.plot-toolbar',graph1).append(b);
                    }

                    var win = jade.window('Test Results: '+(errors.length>0 ? 'errors detected':'passed'),graph1,offset);

                    // resize window to 75% of test pane
                    var win_w = Math.floor(0.75*$(diagram.canvas).width());
                    var win_h = Math.min(200*plots.length,Math.floor(0.75*$(diagram.canvas).height()));
                    win[0].resize(win_w - win.width(),win_h - win.height());
                    offset.top += win_h + 10;
                }

                // report any mismatches
                if (errors.length > 0) {
                    var postscript = '';
                    if (errors.length > 5) {
                        errors = errors.slice(0,5);
                        postscript = '<br>...';
                    }

                    msg = '';
                    if (help_url && t_error) {
                        // create a form to visit courseoverflow.org
                        var url = help_url+'&module='+module.get_name()+'&testNum='+t_error;
                        if (student_id) {
                            url += '&student_id='+student_id;
                        }
                        msg += '<div style="margin-bottom:5px;"><a href="'+url+'" target="_blank"><button>Click to find or submit a hint for this error</button></a></div>';
                    }

                    msg += '<li>'+errors.join('<li>')+postscript;
                    jade.window("Errors detected by test",
                                $('<div class="jade-alert"></div>').html(msg),
                                offset);
                    test_results[module.get_name()] = 'Error detected: '+msg;
                } else {
                    diagram.message('Test successful!');

                    // Benmark = 1e-10/(size_in_m**2 * simulation_time_in_s)
                    var benmark = 1e-10/((results._network_.size*1e-12) * results._network_.time);

                    test_results[module.get_name()] = 'passed '+md5sum+' '+mverify_md5sum+' '+benmark.toString();
                }

                return undefined;
            } else {
                progress[0].update_progress(percent_complete);
                return progress[0].stop_requested;
            }
        }

        function process_results_and_save(percent_complete,results) {
            var response = process_results(percent_complete,results);

            // if this was the final call, save modules to record any
            // test result
            if (percent_complete === undefined) {
                jade.model.save_modules(true);
            }

            return response;
        }

        // do the simulation
        var progress = jade.progress_report();
        jade.window('Progress',progress[0],$(diagram.canvas).offset());
        try {
            if (mode == 'device')
                jade.cktsim.transient_analysis(netlist, time, Object.keys(sampled_signals), process_results_and_save, options);
            else if (mode == 'gate')
                jade.gatesim.transient_analysis(netlist, time, Object.keys(sampled_signals), process_results_and_save, options);
            else 
                throw 'Unrecognized simulation mode: '+mode;
        } catch (e) {
            jade.window_close(progress[0].win);  // done with progress bar
            if (e.stack) console.log(e.stack);
            jade.window('Error running test',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            //diagram.message("Error running simulation:<p>" + e);
            test_results[module.get_name()] = 'Error detected running simulation:<p>'+e;
            return;
        }
    };

    // add netlist elements to drive input nodes
    // for device simulation, each input node has a pullup and pulldown FET
    // with the fet gate waveforms chosen to produce 0, 1 or Z
    function build_inputs_device(netlist,driven_signals,thresholds) {
        // add pullup and pulldown FETs for driven nodes, connected to sources for Voh and Vol
        netlist.push({type: 'voltage source',
                      connections:{nplus: '_voh_', nminus: 'gnd'},
                      properties:{name: '_voh_source', value:{type:'dc',args:[thresholds.Voh]}}});
        netlist.push({type: 'voltage source',
                      connections:{nplus: '_vol_', nminus: 'gnd'},
                      properties:{name: '_vol_source', value:{type:'dc',args:[thresholds.Vol]}}});
        $.each(driven_signals,function(node) {
            netlist.push({type:'pfet',
                          connections:{d:'_voh_', g:node+'_pullup', s:node},
                          properties:{W:100, L:1,name:node+'_pullup'}});
            netlist.push({type:'nfet',
                          connections:{d:node ,g:node+'_pulldown', s:'_vol_'},
                          properties:{W:100, L:1,name:node+'_pulldown'}});
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
    }

    // add netlist elements to drive input nodes
    // for gate simulation, each input node is connected to a tristate driver
    // with the input and enable waveforms chosen to produce 0, 1 or Z
    function build_inputs_gate(netlist,driven_signals,thresholds) {
        // add tristate drivers for driven nodes
        $.each(driven_signals,function(node) {
            netlist.push({type:'tristate',
                          connections:{e:node+'_enable', a:node+'_data', z:node},
                          properties:{name: node+'_input_driver', tcd: 0, tpd: 100e-12, tr: 0, tf: 0, cin:0, size:0}});
        });


        // construct PWL voltage sources to control data and enable inputs for driven nodes
        $.each(driven_signals,function(node,tvlist) {
            var e_pwl = [0,thresholds.Vol];   // initial <t,v> for enable (off)
            var a_pwl = [0,thresholds.Vol];     // initial <t,v> for pullup (0)
            // run through tvlist, setting correct values for pullup and pulldown gates
            $.each(tvlist,function(index,tvpair) {
                var t = tvpair[0];
                var v = tvpair[1];
                var E,A;
                if (v == '0') {
                    // want enable on, data 0
                    E = thresholds.Voh;
                    A = thresholds.Vol;
                }
                else if (v == '1') {
                    // want enable on, data 1
                    E = thresholds.Voh;
                    A = thresholds.Voh;
                }
                else if (v == 'Z' || v=='-') {
                    // want enable off, data is don't care
                    E = thresholds.Vol;
                    A = thresholds.Vol;
                }
                else
                    console.log('node: '+node+', tvlist: '+JSON.stringify(tvlist));
                // ramp to next control voltage over 0.1ns
                var last_E = e_pwl[e_pwl.length - 1];
                if (last_E != E) {
                    if (t != e_pwl[e_pwl.length - 2])
                        e_pwl.push.apply(e_pwl,[t,last_E]);
                    e_pwl.push.apply(e_pwl,[t+0.1e-9,E]);
                }
                var last_A = a_pwl[a_pwl.length - 1];
                if (last_A != A) {
                    if (t != a_pwl[a_pwl.length - 2])
                        a_pwl.push.apply(a_pwl,[t,last_A]);
                    a_pwl.push.apply(a_pwl,[t+0.1e-9,A]);
                }
            });
            // set up voltage sources for enable and data
            netlist.push({type: 'voltage source',
                          connections: {nplus: node+'_enable', nminus: 'gnd'},
                          properties: {name: node+'_enable_source', value: {type: 'pwl', args: e_pwl}}});
            netlist.push({type: 'voltage source',
                          connections: {nplus: node+'_data', nminus: 'gnd'},
                          properties: {name: node+'_data_source', value: {type: 'pwl', args: a_pwl}}});
        });
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
    };

};

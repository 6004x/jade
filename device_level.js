// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.device_level = function(jade) {

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

    function diagram_device_netlist(diagram, globals) {
        var netlist;
        try {
            netlist = device_netlist(diagram.aspect, globals);
        } catch(e) {
            // redraw diagram to show highlighted offenders
            diagram.redraw_background();
            throw e;
        }

        return netlist;
    }

    // build extraction environment, ask diagram to give us flattened netlist
    function device_netlist(aspect,globals) {
        // extract netlist and convert to form suitable for new cktsim.js
        // use modules in the analog libraries as the leafs
        var mlist = ['ground','jumper'];
        jade.model.map_modules(/^\/analog\/.*/,function(m) {
            mlist.push(m.get_name());
        });

        var netlist = aspect.netlist(mlist, globals, '', {}, []);

        // run through extracted netlist, updating device names, evaluating numeric
        // args and eliminating entries we don't care about
        var revised_netlist = [];
        $.each(netlist,function (index,device) {
            var type = device[0];
            var c = device[1];
            var props = device[2];
            if (type == '/analog/nfet')
                revised_netlist.push({type: 'nfet',
                                      connections: c,
                                      properties: {name: props.name, 
                                                   W: jade.utils.parse_number(props.W),
                                                   L: jade.utils.parse_number(props.L)}
                                     });
            else if (type == '/analog/pfet')
                revised_netlist.push({type: 'pfet',
                                      connections: c,
                                      properties: {name: props.name, 
                                                   W: jade.utils.parse_number(props.W),
                                                   L: jade.utils.parse_number(props.L)}
                                     });
            else if (type == '/analog/resistor')
                revised_netlist.push({type: 'resistor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.r)}
                                     });
            else if (type == '/analog/inductor')
                revised_netlist.push({type: 'inductor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.l)}
                                     });
            if (type == '/analog/capacitor')
                revised_netlist.push({type: 'capacitor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.c)}
                                     });
            else if (type == '/analog/v_source')
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == '/analog/i_source')
                revised_netlist.push({type: 'current source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == '/analog/opamp')
                revised_netlist.push({type: 'opamp',
                                      connections: c,
                                      properties: {name: props.name, A: jade.utils.parse_number(props.A)}
                                     });
            else if (type == '/analog/diode')
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
            else if (type == '/analog/v_probe')   // ground connection
                revised_netlist.push({type: 'voltage probe',
                                      connections: c,
                                      properties: {name: props.name, color: props.color, offset: jade.utils.parse_number(props.offset)}
                                     });
            else if (type == '/analog/i_probe')   // current probe
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: {type: 'dc', args: [0]}}
                                     });
            else if (type == '/analog/initial_voltage') // initial voltage
                revised_netlist.push({type: 'initial voltage',
                                      connections: c,
                                      properties: {name: props.name, IV: jade.utils.parse_number(props.IV)}
                                     });
        });

        //console.log(JSON.stringify(netlist));
        //jade.netlist.print_netlist(revised_netlist);

        return revised_netlist;
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
        if (this.type() == "/analog/i_probe") {
            // current probe
            var label = 'I(' + this.name + ')';
            var v = vmap[label];
            if (v !== undefined) {
                var i = jade.utils.engineering_notation(v, 2) + 'A';
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

        var ckt,netlist;
        try {
            netlist = diagram_device_netlist(diagram,[]);
            if (netlist.length == 0) return;
            ckt = new jade.cktsim.Circuit(netlist,diagram.editor.options);
        }
        catch (e) {
            if (e instanceof Error) e = e.stack.split('\n').join('<br>');
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            //diagram.message(e);
            return;
        }

        // run the analysis
        var operating_point;
        try {
            operating_point = ckt.dc(true);
            if (typeof operating_point == 'string') throw results;
            else if (operating_point instanceof Error) throw results.stack.split('\n').join('<br>');
        }
        catch (e) {
            jade.window('Errors during DC analysis',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            return;
        }

        //console.log('OP: '+JSON.stringify(operating_point));

        if (operating_point !== undefined) {
            /*
             // save a copy of the results for submission
             var dc = {};
             for (var i in operating_point) {
             if (i == '_network_') continue;
             dc[i] = operating_point[i];
             }
             // add permanent copy to module's properties
             diagram.aspect.module.set_property('dc_results', dc);
             */

            // display results on diagram
            diagram.add_annotation(function(diagram) {
                display_dc(diagram, operating_point);
            });
        }
    }

    // add DC analysis to tool bar
    jade.schematic_view.schematic_tools.push(['DC', jade.icons.dc_icon, 'DC Analysis', dc_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  DC Sweep
    //
    //////////////////////////////////////////////////////////////////////////////

    // use a dialog to get sweep parameters
    function setup_dc_sweep(diagram) {
        diagram.remove_annotations();

        var vstart_lbl = 'Starting value';
        var vstop_lbl = 'End value';
        var vstep_lbl = 'Step size';
        var source_name_lbl = 'Name of V or I source for sweep';

        var netlist;
        try {
            netlist = diagram_device_netlist(diagram,[]);
            if (find_probes(netlist).length === 0) {
                throw "There are no probes in the diagram!";
            }
        }
        catch (e) {
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        $.each(['Sweep 1','Sweep 2'],function (index,name) {
            fields['('+name+') '+vstart_lbl] = jade.build_input('text', 10, module.property_value(name+'_vstart'));
            fields['('+name+') '+vstop_lbl] = jade.build_input('text', 10, module.property_value(name+'_vstop'));
            fields['('+name+') '+vstep_lbl] = jade.build_input('text', 10, module.property_value(name+'_vstep'));
            fields['('+name+') '+source_name_lbl] = jade.build_input('text', 10, module.property_value(name+'_source'));
            if (name == 'Sweep 1') fields['<i>Optional second sweep</i>'] = '';
        });

        var content = jade.build_table(fields);

        diagram.dialog('DC Sweep', content, function() {
            // retrieve parameters, remember for next time
            var values = [];
            $.each(['Sweep 1','Sweep 2'],function (index,name) {
                var v = fields['('+name+') '+vstart_lbl].value;
                if (v) v = jade.utils.parse_number_alert(v);
                values.push(v);
                module.set_property_attribute(name+'_vstart', 'value', v);

                v = fields['('+name+') '+vstop_lbl].value;
                if (v) v = jade.utils.parse_number_alert(v);
                values.push(v);
                module.set_property_attribute(name+'_vstop', 'value', v);

                v = fields['('+name+') '+vstep_lbl].value;
                if (v) v = jade.utils.parse_number_alert(v);
                values.push(v);
                module.set_property_attribute(name+'_vstep', 'value', v);

                v = fields['('+name+') '+source_name_lbl].value;
                values.push(v);
                module.set_property_attribute(name+'_source', 'value', v);
            });

            dc_sweep(netlist, diagram,
                     {start: values[0], stop: values[1], step: values[2], source: values[3]},
                     {start: values[4], stop: values[5], step: values[6], source: values[7]});
        });
    }

    var colors = ['#268bd2','#dc322f','#859900','#b58900','#6c71c4','#d33682','#2aa198'];

    function dc_sweep(netlist, diagram, sweep1, sweep2) {
        if (netlist.length > 0) {
            var ckt,results;
            try {
                results = jade.cktsim.dc_analysis(netlist, sweep1, sweep2, diagram.editor.options);
                if (typeof results == 'string') throw results;

                var dataseries = [];
                $.each(find_probes(netlist), function (pindex,probe) {
                    var dataset = {xvalues: [],
                                   yvalues: [],
                                   name: [],
                                   color: [],
                                   xunits: 'V',
                                   yunits: '',
                                   type: []
                                  };
                    dataseries.push(dataset);

                    var index2 = 0;
                    var values,x,x2,name,color;
                    while (true) {
                        if (!sweep2.source) {
                            values = results[probe.label];
                            x = results._sweep1_;
                        } else {
                            values = results[index2][probe.label];
                            x = results[index2]._sweep1_;
                            x2 = results[index2]._sweep2_;
                            index2 += 1;
                        }
                        
                        // no values to plot for the given node
                        if (values === undefined)
			    throw "No values to plot for node "+probe.label;

                        // boolean that records if the analysis asked for current through a node
                        name = (probe.type == 'current') ? probe.label : "Node " + probe.label; 
                        color = probe.color;
                        if (sweep2.source) {
                            name += " [with " + sweep2.source + "=" +
                                jade.utils.engineering_notation(x2,2) + (sweep2.units||'') + "]";
                            color = colors[index2 % colors.length];
                        }

                        dataset.xvalues.push(x);
                        dataset.yvalues.push(values);
                        dataset.name.push(name);
                        dataset.color.push(color);
                        dataset.type.push('analog');
                        dataset.xunits = sweep1.units || 'V';
                        dataset.yunits = (probe.type == 'current') ? 'A' : 'V';
                        dataset.xlabel = sweep1.source + " (" + sweep1.units + ")";
                        dataset.ylabel = probe.label + " (" + dataset.yunits + ")";

                        if (!sweep2.source || index2 >= results.length) break;
                    }
                });

                // graph the result and display in a window
                var graph = jade.plot.graph(dataseries);
                diagram.window('Results of DC Sweep', graph);
            }
            catch (e) {
                if (e instanceof Error) e= e.stack.split('\n').join('<br>');
                jade.window('Errors during DC Sweep',
                            $('<div class="jade-alert"></div>').html(e),
                            $(diagram.canvas).offset());
                return;
            }
        }
    }


    // add DC sweep to tool bar
    jade.schematic_view.schematic_tools.push(['sweep', jade.icons.sweep_icon, 'DC Sweep for 1 or 2 sources', setup_dc_sweep]);

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
                result.push({color: properties.color,
                             label: connections.probe,
                             offset: offset,
                             type: 'voltage'});
            } else if (type == 'voltage source' &&
                     properties.value.type == 'dc' &&
                     properties.value.args.length == 1 &&
                     properties.value.args[0] === 0)
                result.push({color: properties.color,
                             label: 'I(' + properties.name + ')',
                             offset: offset,
                             type: 'current'});
        }
        return result;
    }

    // use a dialog to get AC analysis parameters
    function setup_ac_analysis(diagram) {
        diagram.remove_annotations();

        var fstart_lbl = 'Starting frequency (Hz)';
        var fstop_lbl = 'Ending frequency (Hz)';
        var source_name_lbl = 'Name of V or I source for ac';

        var netlist;
        try {
            netlist = diagram_device_netlist(diagram,[]);
            if (find_probes(netlist).length === 0) {
                throw "There are no voltage probes in the diagram!";
            }
        }
        catch (e) {
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        fields[fstart_lbl] = jade.build_input('text', 10, module.property_value('ac_fstart') || '10');
        fields[fstop_lbl] = jade.build_input('text', 10, module.property_value('ac_fstop') || '1G');
        fields[source_name_lbl] = jade.build_input('text', 10, module.property_value('ac_source'));

        var content = jade.build_table(fields);

        diagram.dialog('AC Analysis', content, function() {
            // retrieve parameters, remember for next time
            var ac_fstart = fields[fstart_lbl].value;
            var ac_fstop = fields[fstop_lbl].value;
            var ac_source = fields[source_name_lbl].value;

            module.set_property_attribute('ac_fstart', 'value', ac_fstart);
            module.set_property_attribute('ac_fstop', 'value', ac_fstop);
            module.set_property_attribute('ac_source', 'value', ac_source);

            ac_fstart = jade.utils.parse_number_alert(ac_fstart);
            ac_fstop = jade.utils.parse_number_alert(ac_fstop);
            if (ac_fstart === undefined || ac_fstop === undefined) return;

            ac_analysis(netlist, diagram, ac_fstart, ac_fstop, ac_source, diagram.editor.options);
        });
    }

    // perform ac analysis
    function ac_analysis(netlist, diagram, fstart, fstop, ac_source_name) {
        var npts = 50;

        if (netlist.length > 0) {
            var ckt,results;
            try {
                ckt = new jade.cktsim.Circuit(netlist);
                results = ckt.ac(npts, fstart, fstop, ac_source_name);
                if (typeof results == 'string') throw results;
            }
            catch (e) {
                if (e instanceof Error) e= e.stack.split('\n').join('<br>');
                jade.window('Errors during AC analysis',
                            $('<div class="jade-alert"></div>').html(e),
                            $(diagram.canvas).offset());
                return;
            }

            var x_values = results._frequencies_;
            var i,j,v;
            
            // x axis will be a log scale
            for (i = x_values.length - 1; i >= 0; i -= 1) {
                x_values[i] = Math.log(x_values[i]) / Math.LN10;
            }

            /*
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
             */

            // set up plot values for each node with a probe
            var y_values = []; // list of [color, result_array]
            var z_values = []; // list of [color, result_array]
            var probes = find_probes(netlist);

            var probe_maxv = [];
            var probe_color = [];
            var label,color,offset;

            // Check for probe with near zero transfer function and warn
            for (i = probes.length - 1; i >= 0; i -= 1) {
                if (probes[i].type != 'voltage') continue;
                probe_color[i] = probes[i].color;
                label = probes[i].label;
                v = results[label].magnitude;
                probe_maxv[i] = array_max(v); // magnitudes always > 0
            }
            var all_max = array_max(probe_maxv);

            if (all_max < 1.0e-16) {
                diagram.message('Zero ac response, -infinity on DB scale.');
            }
            else {
                for (i = probes.length - 1; i >= 0; i -= 1) {
                    if (probes[i].type != 'voltage') continue;
                    if ((probe_maxv[i] / all_max) < 1.0e-10) {
                        diagram.message('Near zero ac response, remove ' + probe_color[i] + ' probe');
                        return;
                    }
                }
            }

            var dataseries = [];
            for (i = probes.length - 1; i >= 0; i -= 1) {
                if (probes[i][3] != 'voltage') continue;
                color = probes[i].color;
                label = probes[i].label;
                offset = probes[i].offset;

                v = results[label].magnitude;
                // convert values into dB relative to source amplitude
                var v_max = 1;
                for (j = v.length - 1; j >= 0; j -= 1) {
                    // convert each value to dB relative to max
                    v[j] = 20.0 * Math.log(v[j] / v_max) / Math.LN10;
                }
                // magnitude
                dataseries.push({xvalues: [x_values],
                                 yvalues: [v],
                                 name: [label],
                                 color: [color],
                                 //xlabel: 'log(Frequency in Hz)',
                                 ylabel: 'Magnitude',
                                 yunits: 'dB',
                                 type: ['analog']
                                });
                // phase
                dataseries.push({xvalues: [x_values],
                                 yvalues: [results[label].phase],
                                 name: [label],
                                 color: [color],
                                 xlabel: 'log(Frequency in Hz)',
                                 ylabel: 'Phase',
                                 yunits: '\u00B0',    // degrees
                                 type: ['analog']
                                });
            }

            // graph the result and display in a window
            var graph = jade.plot.graph(dataseries);
            diagram.window('Results of AC Analysis', graph);
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
    jade.schematic_view.schematic_tools.push(['AC', jade.icons.ac_icon, 'AC Analysis', setup_ac_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Transient Analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    function setup_transient_analysis(diagram) {
        diagram.remove_annotations();

        var tstop_lbl = 'Stop Time (seconds)';

        // use modules in the analog library as the leafs
        var netlist;
        try {
            netlist = diagram_device_netlist(diagram,[]);
            if (find_probes(netlist).length === 0) {
                throw "There are no probes in the diagram!";
            }
        }
        catch (e) {
            if (e instanceof Error) e = e.stack.split('\n').join('<br>');
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            return;
        }

        var module = diagram.aspect.module;
        var fields = {};
        fields[tstop_lbl] = jade.build_input('text', 10, module.property_value('tran_tstop'));

        var content = jade.build_table(fields);

        diagram.dialog('Transient Analysis', content, function() {
            // retrieve parameters, remember for next time
            module.set_property_attribute('tran_tstop', 'value', fields[tstop_lbl].value);
            var tstop = jade.utils.parse_number_alert(module.property_value('tran_tstop'));

            if (netlist.length > 0 && tstop !== undefined) {
                // gather a list of nodes that are being probed.  These
                // will be added to the list of nodes checked during the
                // LTE calculations in transient analysis
                var probes = find_probes(netlist);
                var probe_names = {};
                for (var i = probes.length - 1; i >= 0; i -= 1) {
                    probe_names[i] = probes[i].label;
                }

                var progress = jade.progress_report();
                diagram.window('Progress', progress); // display progress bar

                jade.cktsim.transient_analysis(netlist,tstop,probe_names,function(percent_complete,results) {
                    if (results === undefined) {
                        progress[0].update_progress(percent_complete);
                        return progress[0].stop_requested;
                    } else {
                        jade.window_close(progress.win); // all done with progress bar
                        transient_results(results,diagram,probes);
                        return undefined;
                    }
                }, diagram.editor.options);
            }
        });
    }

    // process results of transient analysis
    function transient_results(results,diagram,probes) {
        var v;

        if (typeof results == 'string') {
            jade.window('Errors during Transient analysis',
                        $('<div class="jade-alert"></div>').html(results),
                        $(diagram.canvas).offset());
        } else if (results === undefined) diagram.message("Sorry, no results from transient analysis to plot!");
        else {
            /*
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
             */

            // set up plot values for each node with a probe
            var dataseries = [];

            // use time or, if specified, another probe value for the x axis
            var xvalues = results._xvalues_;
            var color,label;
            for (var i = probes.length - 1; i >= 0; i -= 1) {
                color = probes[i].color;
                label = probes[i].label;
                if (color == 'x-axis') xvalues = results[label];
            }

            for (var i = probes.length - 1; i >= 0; i -= 1) {
                color = probes[i].color;
                label = probes[i].label;
                v = results[label];
                if (v === undefined) {
                    diagram.message('The ' + color + ' probe is connected to node ' + '"' + label + '"' + ' which is not an actual circuit node');
                } else if (color != 'x-axis') {
                    dataseries.push({xvalues: [xvalues],
                                     yvalues: [v],
                                     name: [label],
                                     color: [color],
                                     xunits: 's',
                                     yunits: (probes[i].type == 'voltage') ? 'V' : 'A',
                                     type: ['analog']
                                    });
                }
            }

            // graph the result and display in a window
            var graph = jade.plot.graph(dataseries);
            diagram.window('Results of Transient Analysis', graph);
        }
    }

    // add transient analysis to tool bar
    jade.schematic_view.schematic_tools.push(['tran', jade.icons.tran_icon, 'Device-level Simulation (transient analysis)', setup_transient_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        diagram_device_netlist: diagram_device_netlist,
        interpolate: interpolate
    };

};


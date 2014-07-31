// Copyright (C) 2011-2014 Massachusetts Institute of Technology
// Chris Terman

jade.device_level = (function() {

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
    function device_netlist(aspect) {
        // extract netlist and convert to form suitable for new cktsim.js
        // use modules in the analog libraries as the leafs
        var mlist = ['ground','jumper'];
        if (jade.model.libraries.analog !== undefined)
            $.each(jade.model.libraries.analog.modules,function (mname,module) { mlist.push(module.get_name()); });

        var netlist = aspect.netlist(mlist, '', {}, []);

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
            else if (type == 'analog:resistor')
                revised_netlist.push({type: 'resistor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.r)}
                                     });
            else if (type == 'analog:inductor')
                revised_netlist.push({type: 'inductor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.l)}
                                     });
            if (type == 'analog:capacitor')
                revised_netlist.push({type: 'capacitor',
                                      connections: c,
                                      properties: {name: props.name, value: jade.utils.parse_number(props.c)}
                                     });
            else if (type == 'analog:v_source')
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == 'analog:i_source')
                revised_netlist.push({type: 'current source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
                                     });
            else if (type == 'analog:opamp')
                revised_netlist.push({type: 'opamp',
                                      connections: c,
                                      properties: {name: props.name, A: jade.utils.parse_number(props.A)}
                                     });
            else if (type == 'analog:diode')
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
            else if (type == 'analog:v_probe')   // ground connection
                revised_netlist.push({type: 'voltage probe',
                                      connections: c,
                                      properties: {name: props.name, color: props.color, offset: jade.utils.parse_number(props.offset)}
                                     });
            else if (type == 'analog:i_probe')   // current probe
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: {type: 'dc', args: [0]}}
                                     });
            else if (type == 'analog:initial_voltage') // initial voltage
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
        if (this.type() == "analog:i_probe") {
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

        var netlist = device_netlist(diagram.aspect);

        if (netlist.length > 0) {
            var ckt;
            try {
                ckt = new jade.cktsim.Circuit(netlist);
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
    }

    // add DC analysis to tool bar
    jade.schematic_view.schematic_tools.push(['DC', 'DC', 'DC Analysis', dc_analysis]);

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

        var netlist = device_netlist(diagram.aspect);

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
            var ckt = new jade.cktsim.Circuit(netlist);
            var results;
            try {
                results = ckt.ac(npts, fstart, fstop, ac_source_name);
            }
            catch (e) {
                diagram.message("Error during AC analysis:\n\n" + e);
                return;
            }

            if (typeof results == 'string') diagram.message(results);
            else if (results instanceof Error) diagram.message(results.stack.split('\n').join('<br>'));
            else {
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
    jade.schematic_view.schematic_tools.push(['AC', 'AC', 'AC Analysis', setup_ac_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Transient Analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    function setup_transient_analysis(diagram) {
        diagram.remove_annotations();

        var tstop_lbl = 'Stop Time (seconds)';

        // use modules in the analog library as the leafs
        var netlist = device_netlist(diagram.aspect);

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
            for (var i = probes.length - 1; i >= 0; i -= 1) {
                var color = probes[i][0];
                var label = probes[i][1];
                v = results[label];
                if (v === undefined) {
                    diagram.message('The ' + color + ' probe is connected to node ' + '"' + label + '"' + ' which is not an actual circuit node');
                } else if (color != 'x-axis') {
                    dataseries.push({xvalues: [v.xvalues],
                                     yvalues: [v.yvalues],
                                     name: [label],
                                     color: [color],
                                     xunits: 's',
                                     yunits: (probes[i][3] == 'voltage') ? 'V' : 'A',
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
    jade.schematic_view.schematic_tools.push(['tran', 'TRAN', 'Transient Analysis', setup_transient_analysis]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        device_netlist: device_netlist,
        interpolate: interpolate
    };

}());

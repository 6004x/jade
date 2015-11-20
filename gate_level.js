// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.gate_level = function(jade) {

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Interface to gatesim
    //
    //////////////////////////////////////////////////////////////////////////////

    // parse foo(1,2,3) into {type: foo, args: [1,2,3]}
    function parse_source(value) {
        var m = value.match(/(\w+)\s*\((.*?)\)\s*/);
        var args = $.map(m[2].split(','),jade.utils.parse_number);
        return {type: m[1], args: args};
    }

    // list of gate properties expected by gatesim
    var gate_properties = ['tcd', 'tpd', 'tr', 'tf', 'cin', 'size', 'ts', 'th'];

    function diagram_gate_netlist(diagram, globals) {
        var netlist;
        try {
            netlist = gate_netlist(diagram.aspect, globals);
        } catch(e) {
            // redraw diagram to show highlighted offenders
            diagram.redraw_background();
            throw e;
        }

        return netlist;
    }

    // build extraction environment, ask diagram to give us flattened netlist
    function gate_netlist(aspect,globals) {
        // extract netlist and convert to form suitable for new cktsim.js
        // use modules in the gates library as the leafs
        var mlist = ['ground','jumper','memory','/analog/v_source','/analog/v_probe'];
        jade.model.map_modules(/^\/gates\/.*/,function(m) {
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

            if (/^\/gates\/.*/.test(type)) {
                // copy over relevant properties, evaluating numeric values
                var revised_props = {name: props.name};
                $.each(gate_properties,function (index,pname) {
                    var v = props[pname];
                    if (v) revised_props[pname] = jade.utils.parse_number(v);
                });

                revised_netlist.push({type: type.split('/')[2],
                                      connections: c,
                                      properties: revised_props
                                      });
            }
            else if (type == '/analog/v_source')
                revised_netlist.push({type: 'voltage source',
                                      connections: c,
                                      properties: {name: props.name, value: parse_source(props.value)}
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
            else if (type == 'memory')
                revised_netlist.push({type: 'memory',
                                      connections: c,
                                      properties: props
                                      });
        });

        //console.log(JSON.stringify(netlist));
        //jade.netlist.print_netlist(revised_netlist);

        return revised_netlist;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Gate-level simulation
    //
    //////////////////////////////////////////////////////////////////////////////

    function setup_simulation(diagram) {
        diagram.remove_annotations();

        var tstop_lbl = 'Stop Time (seconds)';

        // use modules in the gates library as the leafs
        var netlist;
        try {
            netlist = diagram_gate_netlist(diagram,[]);
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

                jade.gatesim.transient_analysis(netlist,tstop,probe_names,function(percent_complete,results) {
                    if (results === undefined) {
                        progress[0].update_progress(percent_complete);
                        return progress[0].stop_requested;
                    } else {
                        jade.window_close(progress.win); // all done with progress bar
                        simulation_results(results,diagram,probes);
                        return undefined;
                    }
                },diagram.editor.options);
            }
        });
    }

    // process results of transient analysis
    function simulation_results(results,diagram,probes) {
        var v;

        if (typeof results == 'string') diagram.message("Error during Transient analysis:\n\n" + results);
        else if (results === undefined) diagram.message("Sorry, no results from transient analysis to plot!");
        else {

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
                                     type: ['digital']
                                    });
                }
            }

            // graph the result and display in a window
            var graph = jade.plot.graph(dataseries);
            diagram.window('Results of Gate-level simulation', graph);
        }
    }

    // add transient analysis to tool bar
    jade.schematic_view.schematic_tools.push(['gate', jade.icons.gate_icon, 'Gate-level simulation', setup_simulation]);

    // t is the time at which we want a value
    // times is a list of timepoints from the simulation
    function interpolate(t, times, values) {
        if (values === undefined) return undefined;

        for (var i = 0; i < times.length; i += 1) {
            if (t < times[i]) {
                // t falls between times[i-1] and times[i]
                // so return value after most recent datapoint
                return values[i-1];
            }
        }
        return undefined;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Timing analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    function do_timing(diagram) {
        // use modules in the gates library as the leafs
        var netlist;
        try {
            netlist = diagram_gate_netlist(diagram,['gnd','vdd']);
        }
        catch (e) {
            jade.window('Errors extracting netlist',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
            return;
        }

        var timing;
        try {
            timing = jade.gatesim.timing_analysis(netlist,diagram.editor.options);
            timing = $('<pre style="width:600px;height:400px;padding:5px;overflow-y:auto;overflow-x:hidden;"></pre>').append(timing);
            timing = timing[0];

            timing.resize = function(me,w,h) {
                $(me).height(h);
                $(me).width(w);
            };

            jade.window('Timing analysis',timing,$(diagram.canvas).offset());
        }
        catch (e) {
            jade.window('Errors during timing analysis',
                        $('<div class="jade-alert"></div>').html(e),
                        $(diagram.canvas).offset());
        }
    }

    // add timing analysis to tool bar
    jade.schematic_view.schematic_tools.push(['timing', jade.icons.timing_icon, 'Gate-level timing analysis', do_timing]);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        diagram_gate_netlist: diagram_gate_netlist,
        interpolate: interpolate
    };

};


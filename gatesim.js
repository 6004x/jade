// Copyright (C) 2013-2015 Massachusetts Institute of Technology
// Chris Terman

//////////////////////////////////////////////////////////////////////////////
//
//  Gate-level simulation
//
//////////////////////////////////////////////////////////////////////////////

jade_defs.gatesim = function(jade) {
    var last_network;  // remember most recent network
    function get_last_network() { return last_network; }

    function dc_analysis(netlist, sweep1, sweep2, options) {
        throw "Sorry, no DC analysis with gate-level simulation";
    }

    function ac_analysis(netlist, fstart, fstop, ac_source_name,options) {
        throw "Sorry, no AC analysis with gate-level simulation";
    }

    // Transient analysis
    //   netlist: JSON description of the circuit
    //   tstop: stop time of simulation in seconds
    //   probe_names: optional list of node names to be checked during LTE calculations
    //   progress_callback(percent_complete,network,msg)
    //      function called periodically, return true to halt simulation
    //      until simulation is complete, network is undefined
    //      message is string reporting any hiccups in simulation
    // network object is returned so UI can access event history for each node
    function transient_analysis(netlist, tstop, probe_names, progress_callback, options) {
        if (netlist.length > 0 && tstop !== undefined) {
            var network = new Network(netlist, options || {});

            var progress = {};
            progress.update_interval = 250; // in milliseconds
            progress.finish = function(msg) {
                progress_callback(undefined, network, msg);
            };
            progress.stop_requested = false;
            progress.update = function(percent_complete) { // 0 - 100
                // invoke the callback which will return true if the
                // simulation should halt.
                if (progress_callback(percent_complete, undefined, undefined))
                    progress.stop_requested = true;
            };

            // give system time to show progress bar before we start simulation
            setTimeout(function() {
                try {
                    network.initialize(progress, tstop);
                    network.simulate(new Date().getTime() + network.progress.update_interval);
                }
                catch (e) {
                    progress.finish(e);
                }
            }, 1);
        }
    }

    // return string describing timing results
    function timing_analysis(netlist,options,maxpaths) {
        if (options === undefined) options = {};
        if (maxpaths === undefined) maxpaths = 10;

        options.timing_analysis = true;
        var network = new Network(netlist, options);

        var analysis;
        try {
            analysis = network.get_timing_info();
        } catch (e) {
            return "\n\nOops, timing analysis failed:\n"+e;
        }

        var div_counter = 0;
        function describe_tpd(from,to,tpd,result) {
            if (tpd.length == 0) return result;

            if (result) result += '<p><hr><p>';
            result += 'Worst-case t<sub>PD</sub> from '+from+' to '+to+'\n';

            // sort by pd_sum, longest first
            tpd.sort(function(tinfo1,tinfo2){ return tinfo2.pd_sum - tinfo1.pd_sum; });
            for (var i = 0; i < maxpaths && i < tpd.length; i += 1) {
                tinfo = tpd[i];
                result += '<p>  t<sub>PD</sub> from '+tinfo.get_tpd_source().name+' to '+tinfo.name+' ('+(tinfo.pd_sum*1e9).toFixed(3)+'ns):';
                result += ' <button onclick="$(\'#detail'+div_counter+'\').toggle()">Details</button>\n<div id="detail'+div_counter+'" style="display:none;">';
                result += tinfo.describe_tpd();
                result += '<br></div>';
                div_counter += 1;
            }

            return result;
        }

        var result = '';
        var i,node,tinfo,tpd;

        // report timing constraints for each clock
        $.each(analysis.clocks,function (index,clk) {
            // collect timing info at each device controlled by clk
            var th_violations = [];
            tpd = [];
            $.each(clk.fanouts,function (index,device) {
                tinfo = device.get_clock_info(clk);
                if (tinfo !== undefined) {
                    var src = tinfo.get_tpd_source().node;
                    if (src == clk) tpd.push(tinfo);
                    if (!src.is_input() && tinfo.cd_sum < 0) th_violations.push(tinfo);
                }
            });

            // report clk->clk timing contraints
            result = describe_tpd(clk.name+'\u2191',clk.name+'\u2191',tpd,result);

            // report hold-time violations, if any
            if (th_violations.length > 0) {
                if (result) result += '<p><hr><p>';
                result += 'Hold-time violations for '+clk.name+'\u2191:\n';
                $.each(th_violations,function (index,tinfo) {
                    result += '\n  tCD from '+tinfo.get_tcd_source().name+" to "+tinfo.cd_link.name+" violates hold time by "+(tinfo.cd_sum*1e9).toFixed(3)+"ns:\n";
                    result += tinfo.describe_tcd();
                });
            }

            // get tPDs from clk to top-level outputs
            tpd = [];
            $.each(analysis.timing,function (node,tinfo) {
                // only interested in top-level outputs
                if (tinfo.get_tpd_source().node == clk && tinfo.node.is_output())
                    tpd.push(tinfo);
            });
            result = describe_tpd(clk.name+'\u2191','top-level outputs',tpd,result);
        });

        // report worst-case combinational paths from inputs to top-level outputs
        tpd = [];
        $.each(analysis.timing,function (node,tinfo) {
            // only interested in top-level outputs
            if (tinfo.node.is_output() && !tinfo.get_tpd_source().node.clock)
                tpd.push(tinfo);
        });
        result = describe_tpd('inputs','top-level outputs',tpd,result);

        return result;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Network
    //
    //////////////////////////////////////////////////////////////////////////////

    function Network(netlist, options) {
        this.N = 0;
        this.node_map = {};
        this.aliases = {};
        this.nodes = [];
        this.devices = []; // list of devices
        this.device_map = {}; // name -> device
        this.event_queue = new Heap();
        this.options = options || {};
        this.debug_level = this.options.debug || 0;
        this._network_ = this; // self-reference for compatibility with cktsim

        if (netlist !== undefined) this.load_netlist(netlist, options);
    }

    // find anchor of alias chain
    Network.prototype.unalias = function (name) {
        while (this.aliases[name] !== undefined) name = this.aliases[name];
        return name;
    };

    // make name1 and name2 refer to the same node
    Network.prototype.make_alias = function (name1,name2) {
        name1 = this.unalias(name1);   // strip away the masks!
        name2 = this.unalias(name2);
        if (name1 == name2) return;    // already aliased!

        // how many levels in hierarchical name?
        var levels_1 = (name1.match(/\./g) || []).length;
        var levels_2 = (name2.match(/\./g) || []).length;

        // figure out which name becomes the anchor of the alias chain:
        // gnd is always the anchor
        // top level names are preferred to hierarchical names
        // otherwise simply chose the shorter of the two names
        var winner,loser;
        if (name1 == 'gnd') { winner = name1; loser = name2; }
        else if (name2 == 'gnd') { winner = name2; loser = name1; }
        else if (levels_1 < levels_2) { winner = name1; loser = name2; }
        else if (levels_2 < levels_1) { winner = name2; loser = name1; }
        else if (name1.length <= name2.length) { winner = name1; loser = name2; }
        else { winner = name2; loser = name1; }

        this.aliases[loser] = winner;  // loser now points to winner as the anchor
    };

    // return Node object for specified name, create if necessary
    Network.prototype.node = function(name) {
        name = this.unalias(name);  // resolve name to canonical name

        // find Node in node_map or create a new Node
        var n = this.node_map[name];
        if (n === undefined) {
            n = new Node(name, this);
            this.node_map[name] = n;
            this.nodes.push(n);
            this.N += 1;
        }
        return n;
    };

    // load circuit from JSON netlist: [[device,[connections,...],{prop: value,...}]...]
    Network.prototype.load_netlist = function(netlist, options) {
        last_network = this;

        var network = this;
        network.N = 0;
        network.node_map = {};
        network.aliases = {};
        network.nodes = [];
        network.devices = []; // list of devices
        network.device_map = {}; // name -> device
        network.size = 0;     // total size
        network.counts = {};  // counts by device type
        network.sizes = {};   // sizes by device type

        // handle all the ground connections
        network.gnd = network.node('gnd');
        network.devices.push(new Source(network, 'gnd', network.gnd, {name: 'gnd', value: {type: 'dc', args: []}}));
        $.each(netlist,function (i,component) {
            if (component.type == 'ground') {
                network.node_map[component.connections.gnd] = network.gnd;
            }
        });

        // "connect a b ..." makes a, b, ... aliases for the same node
        $.each(netlist,function (i,component) {
            if (component.type == 'connect') {
                // collect all the names to be aliased
                var c = [];
                $.each(component.connections,function (id,name) { c.push(name); });

                // do pair-wise aliasing with first name on list
                for (var j = 1; j < c.length; j += 1)
                    network.make_alias(c[0],c[j]);
            }
        });

        // process each component in the JSON netlist (see schematic.js for format)
        $.each(netlist,function (i,component) {
            var n,d;
            var type = component.type;
            
            if (type == 'ground' || type == 'connect') return;  // handled above

            var connections = component.connections;
            var properties = component.properties;
            var name = properties.name;

            // convert node names to Nodes
            for (var c in connections) connections[c] = network.node(connections[c]);

            // process the component
            if (type in logic_gates) {
                var info = logic_gates[type]; // [input-list,output,table]
                // build input and output lists using terminal names in info array
                var inputs = [];
                $.each(info[0],function (j,cname) { inputs.push(connections[cname]); });
                // create a new device
                new LogicGate(network, type, name, info[2], inputs, connections[info[1]], properties);
            }
            else if (type == 'dreg' || type == 'dlatch' || type == 'dlatchn') {
                new Storage(network, name, type, connections, properties);
            }
            else if (type == 'memory') {
                // convert node names to Nodes
                $.each(properties.ports, function (i, port) {
                    $.each(port.addr, function (j,name) { port.addr[j] = network.node(name); });
                    $.each(port.data, function (j,name) { port.data[j] = network.node(name); });
                    // make a separate list of output nodes so that tristate buses can successfully
                    // insert BUS devices on the outputs without affecting the input ndoes
                    port.data_out = port.data.slice(0);
                    port.clk = network.node(port.clk);
                    port.wen = network.node(port.wen);
                    port.oe = network.node(port.oe);
                });

                new Memory(network, name, properties, options);
            }
            else if (type == 'constant0' || type == 'constant1') {
                n = connections.z;
                if (n.drivers.length > 0) return; // already handled this one
                n.v = (type == 'constant0' ? V0 : V1);   // should be set by initialization of LogicGate that drives this node
                new LogicGate(network, type, name, type == 'constant0' ? LTable:HTable, [], n, properties);
            }
            else if (type == 'voltage source') {
                n = connections.nplus; // hmmm.
                if (n.drivers.length > 0) return; // already handled this one
                new Source(network, name,  n, properties);
            }
            else throw 'Unrecognized gate: ' + type;
        });

        // give each Node a chance to finalize itself
        $.each(network.node_map, function (n,node) { node.finalize(); });
    };

    Network.prototype.report = function() {
        var network = this;
        var result = $('<div style="padding:5px"></div>');

        // Benmark = 1e-10/(size_in_m**2 * simulation_time_in_s)
        var benmark = 1e-10/((network.size*1e-12) * network.time);
        result.append('Benmark: '+benmark.toFixed(2));

        // min observed setup time
        var min_setup = undefined;
        var min_setup_time = undefined;
        var min_setup_device = undefined;
        $.each(network.devices,function (i,device) {
            if (device.min_setup) {
                if (min_setup === undefined || device.min_setup < min_setup) {
                    min_setup = device.min_setup;
                    min_setup_time = device.min_setup_time;
                    min_setup_device = device.name;
                }
            }
        });
        if (min_setup) {
            result.append('<p>Min observed setup time: '+(min_setup*1e9).toFixed(2)+'ns at time='+(min_setup_time*1e9).toFixed(0)+'ns for device '+min_setup_device);
        }

        // table of component counts and sizes
        var tbl = $('<table class="size-table" border="1" cellpadding="3" style="border-collapse:collapse"><tr><th>Component</th><th>Count</th><th>Size (\u03BC\u00B2)</th></tr></table>');
        tbl.append('<tr><td><i>nodes</i></td><td class="number">'+this.N+'</td><td></td></tr>');

        var total = 0;
        var types = [];
        $.each(network.counts,function (type,count) {
            types.push(type);
            total += count;
        });
        types.sort();
        var size,total = 0;
        $.each(types,function (i,type) {
            total += network.counts[type];
            size = network.sizes[type];
            if (size === undefined) size = '';
            tbl.append('<tr><td>'+type+'</td><td class="number">'+network.counts[type]+'</td><td class="number">'+size+'</td></tr>');
        });
        tbl.append('<tr><td><b>Totals</b></td><td class="number"><b>'+total+'</b></td><td class="number"><b>'+network.size+'</b></td></tr>');
        result.append('<p>',tbl);

        return result;
    };

    Network.prototype.add_component = function(device) {
        var type = device.type;
        this.devices.push(device);
        this.counts[type] = (this.counts[type] || 0) + 1;
        if (device.name) this.device_map[device.name] = device;
        if (device.size) {
            this.size += device.size;
            this.sizes[type] = (this.sizes[type] || 0) + device.size;
        }
    };

    // initialize for simulation, queue initial events
    Network.prototype.initialize = function(progress, tstop) {
        this.progress = progress;
        this.tstop = tstop;
        this.event_queue.clear();
        this.time = 0;

        // initialize nodes
        var i;
        for (i = 0; i < this.nodes.length; i += 1) this.nodes[i].initialize();

        // queue initial events
        for (i = 0; i < this.devices.length; i += 1) this.devices[i].initialize();
    };

    // tupdate is the wall-clock time at which we should take a quick coffee break
    // to let the UI update
    Network.prototype.simulate = function(tupdate) {
        var ecount = 0;
        if (!this.progress.stop_requested) { // halt when user clicks stop
            while (this.time < this.tstop && !this.event_queue.empty()) {
                var event = this.event_queue.pop();
                this.time = event.time;
                event.node.process_event(event);

                // check for coffee break every 1000 events
                if (++ecount < 1000) continue;
                else ecount = 0;

                var t = new Date().getTime();
                if (t >= tupdate) {
                    // update progress bar
                    var completed = Math.round(100 * this.time / this.tstop);
                    this.progress.update(completed);

                    // a brief break in the action to allow progress bar to update
                    // then pick up where we left off
                    var nl = this;
                    setTimeout(function() {
                        try {
                            nl.simulate(t + nl.progress.update_interval);
                        }
                        catch (e) {
                            if (typeof e == 'string') nl.progress.finish(e);
                            else throw e;
                        }
                    }, 1);

                    // our portion of the work is done
                    return;
                }
            }
            this.time = this.tstop;
        }

        // simulation complete or interrupted
        this.progress.finish(undefined);
    };

    Network.prototype.add_event = function(t, type, node, v) {
        var event = new Event(t, type, node, v);
        this.event_queue.push(event);
        if (this.debug_level > 2) console.log("add "+"cp"[type]+" event: "+node.name+"->"+"01XZ"[v]+" @ "+t);
        return event;
    };

    Network.prototype.remove_event = function(event) {
        this.event_queue.removeItem(event);
        if (this.debug_level > 2) console.log("remove "+"cp"[event.type]+" event: "+event.node.name+"->"+"01XZ"[event.v]+" @ "+event.time);
    };
    
    // return {xvalues: array, yvalues: array}, undefined if node has no events.
    // yvalues are 0, 1, 2=X, 3=Z
    Network.prototype.history = function(node) {
        node = this.unalias(node);  // find actual node referred to
        var n = this.node_map[node];
        if (n === undefined) return undefined;

        // record node's final value if not already there
        if (n.times[n.times.length - 1] != this.time) {
            n.times.push(this.time);  
            n.values.push(n.v);
        }
        return {xvalues: n.times, yvalues: n.values};
    };

    // return contents of named memory as an array of values
    Network.prototype.get_memory = function(mem_name) {
        var mem = this.device_map[mem_name];

        if (mem !== undefined && mem.type == 'memory') return mem.get_contents();
        else return undefined;
    };

    Network.prototype.result_type = function() { return 'digital'; };

    Network.prototype.node_list = function() {
        var nlist = [];
        for (var n in this.node_map) nlist.push(n);
        return nlist;
    };

    // run a timing analysis for the network
    Network.prototype.get_timing_info = function() {
        var clocks = [];
        var timing = {};

        $.each(this.node_map,function (node,n) {
            if (n.clock) clocks.push(n);
            timing[node] = n.get_timing_info();
        });

        return {clocks: clocks, timing: timing};
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Events & the event heap
    //
    //////////////////////////////////////////////////////////////////////////////

    var CONTAMINATE = 0; // values chosen so that C events sort before P events
    var PROPAGATE = 1;

    function Event(t, type, node, v) {
        this.time = t; // time of event
        this.type = type; // CONTAMINATE, PROPAGATE
        this.node = node;
        this.v = v;
    }

    // Heaps are arrays for which a[k] <= a[2*k+1] and a[k] <=
    // a[2*k+2] for all k, counting elements from 0.  For the sake
    // of comparison, non-existing elements are considered to be
    // infinite.  The interesting property of a heap is that a[0]
    // is always its smallest element.
    // stolen from Python's heapq.py
    function Heap() {
        this.nodes = [];
    }

    // test heap invariant
    Heap.prototype.assert = function() {
        var len = this.nodes.length;
        var i,j;
        for (i = 0; i < len; i += 1) {
            j = 2*i + 1;
            if (j < len && this.nodes[i].time > this.nodes[j].time) {
                throw 'heap error 1';
            }
            if (j+1 < len && this.nodes[i].time > this.nodes[j+1].time) {
                throw 'heap error 2';
            }
        }
    };

    // specialized for events...
    Heap.prototype.cmplt = function(e1, e2) {
        return e1.time < e2.time;
    };

    // 'heap' is a heap at all indices >= startpos, except possibly for pos.  pos
    // is the index of a leaf with a possibly out-of-order value.  Restore the
    // heap invariant.
    Heap.prototype._siftdown = function(startpos, pos) {
        var newitem, parent, parentpos;
        newitem = this.nodes[pos];
        // follow the path to the root
        while (pos > startpos) {
            parentpos = (pos - 1) >> 1;
            parent = this.nodes[parentpos];
            if (this.cmplt(newitem, parent)) {
                this.nodes[pos] = parent;
                pos = parentpos;
                continue;
            }
            break;
        }
        this.nodes[pos] = newitem;
    };

    // The child indices of heap index pos are already heaps, and we want to make
    // a heap at index pos too.  We do this by bubbling the smaller child of
    // pos up (and so on with that child's children, etc) until hitting a leaf,
    // then using _siftdown to move the oddball originally at index pos into place.
    Heap.prototype._siftup = function(pos) {
        var childpos, endpos, newitem, rightpos, startpos;
        endpos = this.nodes.length;
        startpos = pos;
        newitem = this.nodes[pos];
        // bubble up the smaller child until hitting a leaf
        childpos = 2 * pos + 1;
        while (childpos < endpos) {
            // set childpos to index of smaller child
            rightpos = childpos + 1;
            if (rightpos < endpos && !(this.cmplt(this.nodes[childpos], this.nodes[rightpos]))) {
                childpos = rightpos;
            }
            // move the smaller child up
            this.nodes[pos] = this.nodes[childpos];
            pos = childpos;
            childpos = 2 * pos + 1;
        }
        // the leaf at pos is empty now.  Put newitem there and bubble it up
        // to its final resitng place (by sifting its parents down)
        this.nodes[pos] = newitem;
        this._siftdown(startpos, pos);
    };

    // add new item to the heap
    Heap.prototype.push = function(item) {
        this.nodes.push(item);
        this._siftdown(0, this.nodes.length - 1);
    };

    // remove smallest item from the head
    Heap.prototype.pop = function() {
        var lastelt, returnitem;
        lastelt = this.nodes.pop();
        if (this.nodes.length) {
            returnitem = this.nodes[0];
            this.nodes[0] = lastelt;
            this._siftup(0);
        }
        else {
            returnitem = lastelt;
        }
        return returnitem;
    };

    // see what smallest item is without removing it
    Heap.prototype.peek = function() {
        return this.nodes[0];
    };

    // is item on the heap?
    Heap.prototype.contains = function(item) {
        return this.nodes.indexOf(item) !== -1;
    };

    // rebuild heap after changing an item in the heap
    Heap.prototype.updateItem = function(item) {
        var pos = this.nodes.indexOf(item);
        if (pos != -1) {
            this._siftdown(0, pos);
            this._siftup(pos);
        }
    };

    // remove an item from the head
    Heap.prototype.removeItem = function(item) {
        var pos = this.nodes.indexOf(item);
        if (pos != -1) {
            // replace item to be removed with last element of heap
            // then sift it up to where it belongs
            var lastelt = this.nodes.pop();
            if (item !== lastelt) {
                this.nodes[pos] = lastelt;
                this._siftdown(0, pos);
                this._siftup(pos);
            }
        }
    };

    // clear the heap
    Heap.prototype.clear = function() {
        return this.nodes = [];
    };

    // is the heap empty?
    Heap.prototype.empty = function() {
        return this.nodes.length === 0;
    };

    // how many items on the heap?
    Heap.prototype.size = function() {
        return this.nodes.length;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Node
    //
    //////////////////////////////////////////////////////////////////////////////

    var V0 = 0; // node values
    var V1 = 1;
    var VX = 2;
    var VZ = 3;

    var c_slope = 0; // F/terminal of interconnect capacitance
    var c_intercept = 0; // F of interconnect capacitance

    function Node(name, network) {
        this.name = name;
        this.network = network;

        this.drivers = []; // devices which want to control value of this node
        this.driver = undefined; // device which controls value of this node
        this.fanouts = []; // devices with this node as an input
        this.capacitance = 0; // nodal capacitance
    }

    Node.prototype.initialize = function() {
        this.v = VX;
        this.times = [0.0]; // history of events
        this.values = [VX];
        this.cd_event = undefined; // contamination delay event for this node
        this.pd_event = undefined; // propagation delay event for this node

        // for timing analysis
        this.clock = false; // is this node connected to clock input of state device
        this.timing_info = undefined; // min tCD, max tPD for this node
        this.in_progress = false; // flag to catch combinational cycles
    };

    Node.prototype.add_fanout = function(device) {
        if (this.fanouts.indexOf(device) == -1) this.fanouts.push(device);
    };

    Node.prototype.add_driver = function(device) {
        this.drivers.push(device);
    };

    Node.prototype.process_event = function(event) {
        // update event pointers
        if (event == this.cd_event) this.cd_event = undefined;
        else if (event == this.pd_event) this.pd_event = undefined;
        else console.log('unknown event!',this.name,this.network.time);

        if (this.v != event.v) {
            // record changes in node's value
            this.times.push(event.time);
            this.values.push(event.v);
        }

        if (this.network.debug_level > 0) {
            console.log(this.name + ": " + "01XZ"[this.v] + "->" + "01XZ"[event.v] + " @ " + event.time + [" contamination"," propagation"][event.type]);
        }

        this.v = event.v;

        // let fanouts know about event
        for (var i = this.fanouts.length - 1; i >= 0; i -= 1) {
            if (this.network.debug_level > 1) console.log ("Evaluating ("+"cp"[event.type]+") "+this.fanouts[i].name+" @ "+event.time);
            this.fanouts[i].process_event(event,this);
        }
    };

    Node.prototype.last_event_time = function () {
        return this.times[this.times.length - 1];
    };

    Node.prototype.finalize = function() {
        if (this.drivers === undefined || this.driver !== undefined) return; // already finalized

        // if no explicit capacitance has been supplied, estimate
        // interconnect capacitance
        var ndrivers = this.drivers.length;
        var nfanouts = this.fanouts.length;
        if (ndrivers === 0) {
            if (nfanouts > 0) {
                if (!this.network.options.timing_analysis) {
                    var connections = [];
                    $.each(this.fanouts,function (index,d) { connections.push(d.name); });
                    throw 'Node ' + this.name + ' is not connected to any output<br>but is an input to the following devices:<li>'+connections.join('<li>');
                }
            } else return;  // no drivers, no fanouts... not interesting :)  
        }
        if (this.capacitance === 0) this.capacitance = c_intercept + c_slope * (ndrivers + nfanouts);

        // add capacitances from drivers and fanout connections
        var i,d;
        for (i = 0; i < ndrivers; i += 1)
            this.capacitance += this.drivers[i].capacitance(this);
        for (i = 0; i < nfanouts; i += 1)
            this.capacitance += this.fanouts[i].capacitance(this);

        // if there is only 1 driver then that device is the driver for this node
        if (ndrivers <= 1) {
            this.driver = this.drivers[0];
            this.drivers = undefined;
            return;
        }

        // handle tristates and multiple drivers by adding a special BUS
        // device that computes value from all the drivers
        var inputs = [];
        for (i = 0; i < ndrivers; i += 1) {
            d = this.drivers[i];
            if (!d.tristate(this)) {
                // shorting together non-tristate outputs, so complain
                var msg = 'Node ' + this.name + ' is driven by multiple gates.  See devices:<br>';
                for (var j = 0; j < ndrivers; j += 1)
                    msg += '<li>'+this.drivers[j].name;
                throw msg;
            }
            // cons up a new node and have this device drive it
            var n = this.network.node(this.name + '$' + i.toString());
            n.capacitance = this.capacitance; // each driver has to drive all the capacitance
            inputs.push(n);
            d.change_output_node(this, n);
            n.driver = d;
        }

        // now add the BUS device to drive the current node
        this.capacitance = 0;  // already accounted for on BUS inputs
        this.driver = new LogicGate(this.network, 'BUS', this.name + '%bus', BusTable, inputs, this, {}, true);
        this.drivers = undefined; // finalization complete
    };

    // schedule contamination event for this node
    Node.prototype.c_event = function(tcd) {
        var t = this.network.time + tcd;

        // remove any pending propagation event that happens after tcd
        if (this.pd_event && this.pd_event.time >= t) {
            this.network.remove_event(this.pd_event);
            this.pd_event = undefined;
        }

        // if we've already scheduled a contamination event for an earlier
        // time, make the conservative assumption that node will become
        // contaminated at the earlier possible time, i.e., keep the
        // earlier of the two contamination events
        if (this.cd_event) {
            if (this.cd_event.time <= t) return;
            this.network.remove_event(this.cd_event);
        }

        this.cd_event = this.network.add_event(t, CONTAMINATE, this, VX);
    };

    // schedule propagation event for this node
    Node.prototype.p_event = function(tpd, v, drive, lenient) {
        var t = this.network.time + tpd + drive * this.capacitance;

        if (this.pd_event) {
            // an earlier arriving input may have already determined the
            // value of this node, so leave that event in place if we're
            // a lenient gate
            if (lenient && this.pd_event.v == v && t >= this.pd_event.time) return;
            this.network.remove_event(this.pd_event);
        }

        this.pd_event = this.network.add_event(t, PROPAGATE, this, v);
    };

    // for timing analyses
    Node.prototype.is_input = function () {
        return this.driver === undefined || this.driver instanceof Source;
    };

    Node.prototype.is_output = function () {
        return this.fanouts.length === 0 && this.driver !== undefined &&
            !(this.driver instanceof Source) && this.name.indexOf('.') == -1;
    };

    Node.prototype.get_timing_info = function() {
        if (this.timing_info === undefined) {
            if (this.is_input()) {
                this.timing_info = new TimingInfo(this.name,this);
            } else {
                if (this.in_progress)
                    throw "Combinational cycle detected:\n  "+this.name;
                try {
                    this.in_progress = true;
                    // recursively compute timing info for this node
                    this.timing_info = this.driver.get_timing_info(this);
                    this.in_progress = false;
                } catch (e) {
                    this.in_progress = false;
                    // add our name to the end of the combinational cycle enumeration
                    throw e + "\n  " + this.name;
                }
            }
        }
        return this.timing_info;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Sources
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Source(network, name, output, properties) {
        this.type = 'voltage source';
        this.network = network;
        this.name = name;
        this.output = output;

        this.vil = network.options.vil || 0.1;
        this.vih = network.options.vih || 0.9;

        var v = jade.utils.parse_source(properties.value);
        if (v.fun == 'sin') throw "Can't use sin() sources in gate-level simulation";

        if (v.fun == 'dc') {
            output.constant_value = true;
            this.tvpairs = [0, v.args[0]];   // single t,v pair
            this.period = 0;
        } else {
            this.tvpairs = v.tvpairs;
            this.period = v.period;

            // for periodic source, construct two periods of tvpairs so that
            // it's easy to search for next transition when it's in the next
            // period.
            if (this.period !== 0) {
                this.tvpairs = this.tvpairs.slice(0);  // copy tv pairs
                for (var i = 0; i < v.tvpairs.length; i += 2) {
                    this.tvpairs.push(v.tvpairs[i] + this.period);  // time in the next period
                    this.tvpairs.push(v.tvpairs[i+1]);   // voltage
                }
            }
        }

        // figure out initial value from first t,v pair
        this.initial_value = this.tvpairs[1] <= this.vil ? V0 : (this.tvpairs[1] >= this.vih ? V1 : VX);

        output.add_fanout(this);    // listen for our own events!
        output.add_driver(this);

        network.add_component(this);
    }

    Source.prototype.change_output_node = function(old_node,new_node) {
        if (this.output == old_node) this.output = new_node;
    };

    Source.prototype.initialize = function() {
        if (this.initial_value != VX)
            this.output.p_event(0,this.initial_value,0,false);
    };

    Source.prototype.capacitance = function(node) {
        return 0;
    };

    // is node a tristate output of this device?
    Source.prototype.tristate = function(node) {
        return false;
    };

    // figure out next event for source -- triggered by last event!
    Source.prototype.process_event = function(event,cause) {
        var time = this.network.time;
        var t,v;

        // propagate events on source's output cause new events
        // to be scheduled for *next* source transition
        if (event.type == PROPAGATE) {
            t = this.next_contamination_time(time);
            if (t >= 0) this.output.c_event(t - time);
            //console.log(this.output.name + ": "+(t * 1e9).toFixed(2) + ' -> contaminate');

            t = this.next_propagation_time(time);
            if (t.time > 0) this.output.p_event(t.time - time, t.value, 0, false);
            //console.log(this.output.name + ": "+(t.time * 1e9).toFixed(2) + ' -> ' + "01XZ"[t.value]);
        }
    };

    // return time of next contamination event for pwl source
    Source.prototype.next_contamination_time = function(xtime) {
        xtime += 1e-13;  // get past current time by epsilon

        // handle periodic sources
        var time = xtime;   // time we'll be searching for in tvpairs
        var tbase = 0;      // time at beginning of period
        if (this.period !== 0) {
            time = Math.fmod(time,this.period);
            tbase = xtime - time;
        }

        var tlast = 0;
        var vlast = 0;
        var npairs = this.tvpairs.length;
        var et;
        for (var i = 0; i < npairs; i += 2) {
            var t = this.tvpairs[i];
            var v = this.tvpairs[i+1];
            if (i > 0 && time <= t) {
                if (vlast >= this.vih && v < this.vih) {
                    et = tlast + (t - tlast)*(this.vih - vlast)/(v - vlast);
                    if (et > time) return tbase+et;
                }
                else if (vlast <= this.vil && v > this.vil) {
                    et = tlast + (t - tlast)*(this.vil - vlast)/(v - vlast);
                    if (et > time) return tbase+et;
                }
            }
            tlast = t;
            vlast = v;
        }
        return -1;
    };

    // return {time:t, value: v} of next propagation event for pwl source
    Source.prototype.next_propagation_time = function (xtime) {
        xtime += 1e-13;  // get past current time by epsilon

        // handle periodic sources
        var time = xtime;   // time we'll be searching for in tvpairs
        var tbase = 0;      // time at beginning of period
        if (this.period !== 0) {
            time = Math.fmod(time,this.period);
            tbase = xtime - time;
        }

        var tlast = 0;
        var vlast = 0;
        var npairs = this.tvpairs.length;
        var et;
        for (var i = 0; i < npairs; i += 2) {
            var t = this.tvpairs[i];
            var v = this.tvpairs[i+1];
            if (i > 0 && time <= t) {
                if (vlast < this.vih && v >= this.vih) {
                    et = tlast + (t - tlast)*(this.vih - vlast)/(v - vlast);
                    if (et > time) return {time: tbase+et, value: V1};
                }
                else if (vlast > this.vil && v <= this.vil) {
                    et = tlast + (t - tlast)*(this.vil - vlast)/(v - vlast);
                    if (et > time) return {time: tbase+et, value: V0};
                }
            }
            tlast = t;
            vlast = v;
        }
        return {time: -1};
    };

    Source.prototype.get_clock_info = function(clk) {
        return undefined;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Logic gates
    //
    ///////////////////////////////////////////////////////////////////////////////

    // it's tables all the way down
    // use current input as index into current table to get new table
    // repeat until all inputs have been consumed
    // final value is given by current_table[4]

    var LTable = [];
    LTable.push(LTable, LTable, LTable, LTable, 0); // always "0"
    var HTable = [];
    HTable.push(HTable, HTable, HTable, HTable, 1); // always "1"
    var XTable = [];
    XTable.push(XTable, XTable, XTable, XTable, 2); // always "X"
    var ZTable = [];
    ZTable.push(ZTable, ZTable, ZTable, ZTable, 3); // always "Z"
    var SelectTable = [LTable, HTable, XTable, XTable, 2]; // select this input
    var Select2ndTable = [SelectTable, SelectTable, SelectTable, SelectTable, 2]; // select second input
    var Select3rdTable = [Select2ndTable, Select2ndTable, Select2ndTable, Select2ndTable, 2]; // select third input
    var Select4thTable = [Select3rdTable, Select3rdTable, Select3rdTable, Select3rdTable, 2]; // select fourth input
    var Ensure0Table = [LTable, XTable, XTable, XTable, 2]; // must be 0
    var Ensure1Table = [XTable, HTable, XTable, XTable, 2]; // must be 1
    var EqualTable = [Ensure0Table, Ensure1Table, XTable, XTable, 2]; // this == next

    // tristate bus resolution
    // produces "Z" if all inputs are "Z"
    // produces "1" if one input is "1" and other inputs are "1" or "Z"
    // produces "0" if one input is "0" and other inputs are "0" or "Z"
    // produces "X" otherwise
    var BusTable = [];
    var Bus0Table = [];
    var Bus1Table = [];
    BusTable.push(Bus0Table, Bus1Table, XTable, BusTable, 3);
    Bus0Table.push(Bus0Table, XTable, XTable, Bus0Table, 0);
    Bus1Table.push(XTable, Bus1Table, XTable, Bus1Table, 1);

    // tristate buffer (node order: enable,in)
    var TristateBufferTable = [ZTable, SelectTable, XTable, XTable, 2];

    // and tables
    var AndXTable = [];
    AndXTable.push(LTable, AndXTable, AndXTable, AndXTable, 2);
    var AndTable = [];
    AndTable.push(LTable, AndTable, AndXTable, AndXTable, 1);

    // nand tables
    var NandXTable = [];
    NandXTable.push(HTable, NandXTable, NandXTable, NandXTable, 2);
    var NandTable = [];
    NandTable.push(HTable, NandTable, NandXTable, NandXTable, 0);

    // or tables
    var OrXTable = [];
    OrXTable.push(OrXTable, HTable, OrXTable, OrXTable, 2);
    var OrTable = [];
    OrTable.push(OrTable, HTable, OrXTable, OrXTable, 0);

    // nor tables
    var NorXTable = [];
    NorXTable.push(NorXTable, LTable, NorXTable, NorXTable, 2);
    var NorTable = [];
    NorTable.push(NorTable, LTable, NorXTable, NorXTable, 1);

    // xor tables
    var XorTable = [];
    var Xor1Table = [];
    XorTable.push(XorTable, Xor1Table, XTable, XTable, 0);
    Xor1Table.push(Xor1Table, XorTable, XTable, XTable, 1);
    var XnorTable = [];
    var Xnor1Table = [];
    XnorTable.push(XnorTable, Xnor1Table, XTable, XTable, 1);
    Xnor1Table.push(Xnor1Table, XnorTable, XTable, XTable, 0);

    // 2-input mux table (node order: sel,d0,d1)
    var Mux2Table = [SelectTable, Select2ndTable, EqualTable, EqualTable, 2];

    // 4-input mux table (node order: s0,s1,d0,d1,d2,d3)
    var Mux4aTable = [SelectTable, Select3rdTable, EqualTable, EqualTable, 2]; // s0 == 0
    var Mux4bTable = [Select2ndTable, Select4thTable, EqualTable, EqualTable, 2]; // s0 == 1
    var Mux4Table = [Mux4aTable, Mux4bTable, EqualTable, EqualTable, 2];

    // for each logic gate provide [input-terminal-list,output-terminal,table]
    var logic_gates = {
        'and2': [['a', 'b'], 'z', AndTable],
        'and3': [['a', 'b', 'c'], 'z', AndTable],
        'and4': [['a', 'b', 'c', 'd'], 'z', AndTable],
        'buffer': [['a'], 'z', AndTable],
        'buffer_h': [['a'], 'z', AndTable],
        'inverter': [['a'], 'z', NandTable],
        'mux2': [['s', 'd0', 'd1'], 'y', Mux2Table],
        'mux4': [['s[0]', 's[1]', 'd0', 'd1', 'd2', 'd3'], 'y', Mux4Table],
        'nand2': [['a', 'b'], 'z', NandTable],
        'nand3': [['a', 'b', 'c'], 'z', NandTable],
        'nand4': [['a', 'b', 'c', 'd'], 'z', NandTable],
        'nor2': [['a', 'b'], 'z', NorTable],
        'nor3': [['a', 'b', 'c'], 'z', NorTable],
        'nor4': [['a', 'b', 'c', 'd'], 'z', NorTable],
        'or2': [['a', 'b'], 'z', OrTable],
        'or3': [['a', 'b', 'c'], 'z', OrTable],
        'or4': [['a', 'b', 'c', 'd'], 'z', OrTable],
        'tristate': [['e', 'a'], 'z', TristateBufferTable],
        'xor2': [['a', 'b'], 'z', XorTable],
        'xnor2': [['a', 'b'], 'z', XnorTable]
    };

    function LogicGate(network, type, name, table, inputs, output, properties) {
        this.network = network;
        this.type = type;
        this.name = name;
        this.table = table;
        this.inputs = inputs;
        this.output = output;
        this.properties = properties;
        this.size = properties.size || 0;

        // by default logic gates are lenient
        this.lenient = (properties.lenient === undefined) ? true : properties.lenient !== 0;
        // but devices with 0 or 1 inputs are lenient by definition!
        if (inputs.length < 2) this.lenient = true;

        // gates with no input generate constant value outputs
        if (inputs.length === 0) output.constant_value = true;

        this.cout = properties.cout || 0;
        this.cin = properties.cin || 0;
        this.tcd = properties.tcd || 0;
        this.tpdf = properties.tpdf || properties.tpd || 0;
        this.tpdr = properties.tpdr || properties.tpd || 0;
        this.tr = properties.tr || 0;
        this.tf = properties.tf || 0;

        for (var i = 0; i < inputs.length ; i+= 1) inputs[i].add_fanout(this);
        output.add_driver(this);

        var in0 = inputs[0];
        var in1 = inputs[1];
        var in2 = inputs[2];
        var in3 = inputs[3];
        var in4 = inputs[4];
        var in5 = inputs[5];
        if (inputs.length === 0) this.logic_eval = function() {
            return table[4];
        };
        else if (inputs.length == 1) this.logic_eval = function() {
            return table[in0.v][4];
        };
        else if (inputs.length == 2) this.logic_eval = function() {
            return table[in0.v][in1.v][4];
        };
        else if (inputs.length == 3) this.logic_eval = function() {
            return table[in0.v][in1.v][in2.v][4];
        };
        else if (inputs.length == 4) this.logic_eval = function() {
            return table[in0.v][in1.v][in2.v][in3.v][4];
        };
        else if (inputs.length == 5) this.logic_eval = function() {
            return table[in0.v][in1.v][in2.v][in3.v][in4.v][4];
        };
        else if (inputs.length == 6) this.logic_eval = function() {
                var v0,v1;

                // special case eval function for mux4 with X's on select lines
                if (type == 'mux4' && (in0.v >= VX || in1.v >= VX)) {
                    if (in0.v >= VX) {
                        if (in1.v >= VX) {
                            // both s0 and s1 are X
                            // check to see if d0 == d1 == d2 == d3 to see if selects matter
                            if (in2.v==in3.v && in2.v==in4.v && in2.v==in5.v) return in2.v;
                            else return VX;
                        } else {
                            // just s0 is X
                            // if s1 is 0, check to see if d0 == d1 to see if s0 matters
                            // otherwise, check to see if d2 == d3 to see if s0 matters
                            if (in1.v == V0) {
                                if (in2.v == in3.v) return in2.v;
                                else return VX;
                            } else {
                                if (in4.v == in5.v) return in4.v;
                                else return VX;
                            }
                        }
                    } else {
                        // just s1 is X
                        // if s0 is 0, check to see if d0 == d2 to see if s1 matters
                        // otherwise, check to see if d1 == d3 to see if s1 matters
                        if (in0.v == V0) {
                            if (in2.v == in4.v) return in2.v;
                            else return VX;
                        } else {
                            if (in3.v == in5.v) return in3.v;
                            else return VX;
                        }
                    }
                }

                // otherwise use tables to compute answer
                return table[in0.v][in1.v][in2.v][in3.v][in4.v][in5.v][4];
        };
        else this.logic_eval = function() {
            // handles arbitrary numbers of inputs (eg, for BusTable).
            var t = table;
            for (var i = 0; i < inputs.length ; i+= 1) t = t[inputs[i].v];
            return t[4];
        };

        network.add_component(this);
    }

    LogicGate.prototype.change_output_node = function(old_node,new_node) {
        if (this.output == old_node) this.output = new_node;
    };

    LogicGate.prototype.initialize = function() {
        if (this.inputs.length === 0) {
            // gates with no inputs will produce a constant output, so
            // figure that out now and process the appropriate event
            var v = this.logic_eval();
            this.output.p_event(0,v,0,false);
        }
    };

    // capacitance contribution from this device for node
    LogicGate.prototype.capacitance = function(node) {
	var c = 0;
	for (var i = 0; i < this.inputs.length; i += 1)
	    if (this.inputs[i] == node) c += this.cin;
	if (this.output == node) c += this.cout;
	return c;
    };

    // is node a tristate output of this device?
    LogicGate.prototype.tristate = function(node) {
        if (this.output == node && this.table == TristateBufferTable) return true;
        else return false;
    };

    // show what logic gate is thinking at this moment
    LogicGate.prototype.describe = function(prefix) {
        var inputs = [];
        for (var k = 0; k < this.inputs.length; k += 1) {
            inputs.push(this.inputs[k].name+"="+"01XZ".charAt(this.inputs[k].v));
        }
        var output = "01XZ".charAt(this.logic_eval());
        console.log((prefix||'')+this.name+":"+this.type+"("+inputs.join(',')+")="+output+
                   " @ "+(this.network.time*1e9).toFixed(3));
        console.log("    output "+this.output.name+"="+"01XZ".charAt(this.output.v)+" @ "+
                   (this.output.last_event_time()*1e9).toFixed(3));
    };

    // evaluation of output values triggered by an event on the input
    LogicGate.prototype.process_event = function(event,cause) {
        var onode = this.output;
        var v;

        if (event.type == CONTAMINATE) {
            // a lenient gate won't contaminate the output under the right circumstances
            if (this.lenient) {
                v = this.logic_eval();
                if (onode.pd_event === undefined) {
                    // no events pending and current value is same as new value
                    if (onode.cd_event === undefined && v == onode.v) return;
                }
                else {
                    // node is destined to have the same value as new value
                    if (v == onode.pd_event.v) return;
                }
            }

            // schedule contamination event with specified delay
            onode.c_event(this.tcd);
        }
        else if (event.type == PROPAGATE) {
            // always forward propagate events to the output so
            // downstream gates will get a chance to recover from
            // an earlier contamination event.
            v = this.logic_eval();

            var drive, tpd;
            if (v == V1) { tpd = this.tpdr; drive = this.tr; }
            else if (v == V0) { tpd = this.tpdf; drive = this.tf; }
            else { tpd = Math.min(this.tpdr, this.tpdf); drive = 0; }
            onode.p_event(tpd, v, drive, this.lenient);
        }
    };

    LogicGate.prototype.get_timing_info = function(output) {
        var tr = this.tpdr + this.tr*output.capacitance;
        var tf = this.tpdf + this.tf*output.capacitance;
        var tinfo = new TimingInfo(output.name,output,this,this.tcd,Math.max(tr,tf));

        // loop through inputs looking for min/max paths
        for (var i = 0; i < this.inputs.length ; i+= 1) {
            // constant inputs don't contribute to timing
            if (this.inputs[i].constant_value) continue;
            tinfo.set_delays(this.inputs[i].get_timing_info());
        }
        return tinfo;
    };

    LogicGate.prototype.get_clock_info = function(clk) {
        return undefined;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Storage elements: dreg, dlatch, dlatchn
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Storage(network, name, type, connections, properties) {
        this.network = network;
        this.name = name;
        this.type = type;
        this.size = properties.size || 0;

        // 9/11/14 SAW: DREG terminal names seem to be upper case, fixed refs here:
        this.d = connections.d;
        this.clk = (type == 'dreg') ? connections.clk : connections.g;
        this.q = connections.q;

        this.d.add_fanout(this);
        this.clk.add_fanout(this);
        this.q.add_driver(this);

        // clk node gets special treatment during timing analysis
        if (type == 'dreg') this.clk.clock = true;

        this.gate_open = (type == 'dlatch') ? V1 : V0;   // when is latch open?
        this.gate_closed = (type == 'dlatch') ? V0 : V1;   // when is latch closed?

        this.properties = properties;
        // by default storage devices aren't lenient
        this.lenient = (properties.lenient === undefined) ? false : properties.lenient !== 0;
        this.cout = properties.cout || 0;
        this.cin = properties.cin || 0;
        this.tcd = properties.tcd || 0;
        this.tpdf = properties.tpdf || properties.tpd || 0;
        this.tpdr = properties.tpdr || properties.tpd || 0;
        this.tr = properties.tr || 0;
        this.tf = properties.tf || 0;
        this.ts = properties.ts || 0;
        this.th = properties.th || 0;

        network.add_component(this);
    }

    Storage.prototype.change_output_node = function(old_node,new_node) {
        if (this.q == old_node) this.q = new_node;
    };

    Storage.prototype.initialize = function() {
        this.min_setup = undefined;
        this.min_setup_time = undefined;
        this.state = VX;
    };

    // capacitance contribution from this device for node
    Storage.prototype.capacitance = function(node) {
        var c = 0;
        if (this.q == node) c += this.cout;
        if (this.d == node) c += this.cin;
        if (this.clk == node) c += this.cin;
        return c;
    };

    // is node a tristate output of this device?
    Storage.prototype.tristate = function(node) { return false; };

    // evaluation of output values triggered by an event on the input
    Storage.prototype.process_event = function(event,cause) {
        if (this.type == 'dreg') {
            if (event.type != PROPAGATE) return;  // no contamination events allowed!

            // if CLK is 0, master latch (ie, state) follows D input
            if (this.clk.v == V0) {
                this.state = this.d.v;
                this.edge_possible = true;   // remember clk value so we can detect rising edges
            }
            // otherwise we only care about event if CLK is changing
            else if (this.clk == cause) {
                if (this.clk.v == V1) {  // rising clock edge!
                    // track minimum setup time we see
                    var now = this.network.time;
                    var d_time = this.d.last_event_time();
                    if (d_time !== undefined && this.edge_possible) {
                        if (now > 0) {
                            var tsetup = now - d_time;
                            if (this.min_setup === undefined || tsetup < this.min_setup) {
                                this.min_setup = tsetup;
                                this.min_setup_time = now;
                            }
                        }
                    }
                    // report setup time violations?
                    this.edge_possible = false;

                    // for lenient dreg's, q output is contaminated only
                    // when new output value differs from current one
                    if (!this.lenient || this.state != this.q.v)
                        this.q.c_event(this.tcd);

                    // always forward propagate events to the output so
                    // downstream gates will get a chance to recover from
                    // an earlier contamination event.
                    this.q.p_event((this.state == V0) ? this.tpdf : this.tpdr,
                                   this.state,
                                   (this.state == V0) ? this.tf : this.tr,
                                   this.lenient);
                } else {
                    // X on clock won't contaminate value in master if we're
                    // a lenient register and master == D
                    if (!this.lenient || this.state != this.d.v) this.state = VX;

                    // send along to Q if we're not lenient or if master != Q
                    if (!this.lenient || this.state != this.q.v)
                        this.q.p_event(Math.min(this.tpdf,this.tpdr),
                                       VX,0,this.lenient);
                }
            }
        } else {
            // compute output of latch
            var v = (this.clk.v == this.gate_closed) ? this.state :
                    (this.clk.v == this.gate_open) ? this.d.v :
                    (this.lenient && this.d.v == this.state) ? this.state : VX;

            // state follows D when gate is open
            if (this.clk.v == this.gate_open) this.state = v;

            if (event.type == CONTAMINATE) {
                // a lenient latch sometimes won't contaminate output
                if (this.lenient) {
                    if (this.q.pd_event == undefined) {
                        // no events pending and current value is same as new value
                        if (this.q.cd_event == undefined && v == this.q.v) return;
                    } else {
                        // node is destined to have the same value as new value
                        if (v == this.q.pd_event.v) return;
                    }
                }
                // schedule contamination event with specified delay
                this.q.c_event(this.tcd);
            } else if (event.type == PROPAGATE) {
                // avoid scheduling PROPAGATE events if we can...
                if (!this.lenient || v != this.q.v || this.q.cd_event !== undefined || this.q.pd_event !== undefined) {
                    var drive,tpd;
                    if (v == V1) { tpd = this.tpdr; drive = this.tr; }
                    else if (v == V0) { tpd = this.tpdf; drive = this.tf; }
                    else { tpd = Math.min(this.tpdr,this.tpdf); drive = 0; }
                    this.q.p_event(tpd,v,drive,this.lenient);
                }
            }
        }
    };

    Storage.prototype.get_timing_info = function(output) {
        var tr = this.tpdr + this.tr*output.capacitance;
        var tf = this.tpdf + this.tf*output.capacitance;
        var tinfo = new TimingInfo(output.name,output,this,this.tcd,Math.max(tr,tf));

        var cinfo = $.extend({},this.clk.get_timing_info());  // make a copy
        cinfo.name = cinfo.name + '\u2191';  // add rising edge indicator to name
        tinfo.set_delays(cinfo);

        if (this.type != 'dreg') {
            // latch timing also depends on D input
            tinfo.set_delays(this.d.get_timing_info());
        }

        return tinfo;
    };

    Storage.prototype.get_clock_info = function(clk) {
        if (this.type == 'dreg') {
            // account for setup and hold times
            var tinfo = new TimingInfo(clk.name+'\u2191',clk,this,-this.th,this.ts);
            tinfo.set_delays(this.d.get_timing_info());
            return tinfo;
        };
        return undefined;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Memories
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Memory(network, name, properties, options) {
        var mem = this;
        mem.type = 'memory';
        mem.network = network;
        mem.name = name;

        // set up properties
        mem.width = properties.width;
        if (mem.width === undefined || mem.width <= 0)
            throw "Memory "+name+" must have width > 0.";
        mem.nlocations = properties.nlocations;
        if (mem.nlocations === undefined || mem.nlocations <= 0)
            throw "Memory "+name+" must have > 0 locations.";
        mem.contents = properties.contents;

        // by default memories are lenient
        mem.lenient = (properties.lenient === undefined) ? true : properties.lenient !== 0;
        mem.cout = properties.cout || options.mem_cout || 0;
        mem.cin = properties.cin || options.mem_cin || .005e-12;
        mem.tcd = properties.tcd || options.mem_tcd || 20e-12;
        mem.tr = properties.tr || options.mem_tr || 1000;
        mem.tf = properties.tf || options.mem_tf || 500;
        mem.ts = properties.ts || options.mem_ts || (2*mem.tcd);
        mem.th = properties.th || options.mem_th || mem.tcd;

        // tPD depends on number of memory locations
        // local properties take precedence over global options
        if (mem.nlocations > 1024) {          // dram
            mem.tpdf = properties.tpdf || properties.tpd ||
                options.mem_tpdf_dram || options.mem_tpd_dram || 40e-9;
            mem.tpdr = properties.tpdr || properties.tpd ||
                options.mem_tpdr_dram || options.mem_tpd_dram || 40e-9;
        } else if (mem.nlocations > 128) {   // sram
            mem.tpdf = properties.tpdf || properties.tpd ||
                options.mem_tpdf_sram || options.mem_tpd_sram || 4e-9;
            mem.tpdr = properties.tpdr || properties.tpd ||
                options.mem_tpdr_sram || options.mem_tpd_sram || 4e-9;
        } else {                             // regfile
            mem.tpdf = properties.tpdf || properties.tpd ||
                options.mem_tpdf_regfile || options.mem_tpd_regfile || 2e-9;
            mem.tpdr = properties.tpdr || properties.tpd ||
                options.mem_tpdr_regfile || options.mem_tpd_regfile || 2e-9;
        }

        // set up fanouts and drivers
        mem.ports = properties.ports || [];
        mem.tristate_outputs = [];   // remember which nodes memory can drive
        mem.n_read_ports = 0;
        mem.n_write_ports = 0;
        mem.naddr = 0;
        $.each(mem.ports, function (i,port) {
            // we listen to clk, wen, oe and addr signals
            port.clk.add_fanout(mem);
            port.wen.add_fanout(mem);
            port.oe.add_fanout(mem);
            $.each(port.addr, function (j, node) { node.add_fanout(mem); });
            mem.naddr = port.addr.length;

            // if there's a possibility of a write, we listen to data nodes
            if (port.clk != network.gnd || port.wen != network.gnd) {
                mem.n_write_ports += 1;
                port.write_port = true;
                $.each(port.data, function (j, node) { node.add_fanout(mem); });
            }

            // if there's a possibility of a read, add data nodes as drivers
            if (port.oe != network.gnd) {
                mem.n_read_ports += 1;
                port.read_port = true;
                $.each(port.data, function (j, node) {
                    node.add_driver(mem);
                    if (mem.tristate_outputs.indexOf(node) == -1) mem.tristate_outputs.push(node);
                });
            }
        });

        // allocate internal storage array, one location per bit since we're lazy
        mem.bits = new Uint8Array(mem.nlocations * mem.width);  // array of memory bits

        // compute size
        var cell;   // size of each storage cell (not including access fet)
        if (mem.n_read_ports == 1 && mem.n_write_ports == 0)  // ROM
            cell = 0;
        else if (mem.nlocations <= 1024)   // SRAM
            cell = options.mem_size_sram || 5;
        else cell = 0; // DRAM
        // add 1 access fet per port
        cell += mem.ports.length * (options.mem_size_access || 1);

        // start with storage cell area = number of bits * cell size
        // (1 access fet per port + size of storage cell)
        mem.size = (mem.nlocations * mem.width) * cell;
        // size of address buffers
        mem.size += mem.ports.length * mem.naddr * (options.mem_size_address_buffer || 20);
        // size of address decoders (assuming 4-input ands)
        mem.size += mem.ports.length * mem.naddr * (options.mem_size_address_decoder || 4);
        // size of tristate output drivers
        mem.size += mem.n_read_ports * mem.width * (options.mem_size_output_buffer || 30);
        // size of write data drivers
        mem.size += mem.n_write_ports * mem.width * (options.mem_size_write_buffer || 20);

        network.add_component(this);
    }

    Memory.prototype.change_output_node = function(old_node,new_node) {
        $.each(this.ports,function (i, port) {
            $.each(port.data_out,function (j,dnode) {
               if (dnode == old_node) port.data_out[j] = new_node;
            });
        });
    };

    // return contents of memory as an array.
    // array element will be undefined if any bits in corresponding word are X.
    Memory.prototype.get_contents = function() {
        var result = [];
        for (var i = 0; i < this.nlocations; i += 1) {
            var word = 0;
            for (var j = 0; j < this.width; j += 1) {
                var v = this.bits[i*this.width + (this.width-1-j)];
                if (v == VX) { word = undefined; break; }
                word *= 2;    // logical operations limit result to 32 bits
                if (v == V1) word += 1;
            }
            result[i] = word;
        }
        return result;
    };

    // set all memory locations to X
    Memory.prototype.clear_memory = function() {
        var nbits = this.nlocations * this.width;
        for (var i = 0; i < nbits; i += 1) this.bits[i] = VX;
    };

    Memory.prototype.initialize = function() {
        this.min_setup = undefined;     // min observed setup time on inputs
        this.min_setup_time = undefined;  // when min observed setup was observer

        this.clear_memory();  // start with all X's

        // did user specify initial contents?
        if (this.contents !== undefined && this.contents.length > 0) {
            for (var i = 0; i < this.nlocations; i += 1) {
                var word = this.contents[i];
                if (word === undefined) {
                    continue;
                }
                for (var j = 0; j < this.width; j += 1, word >>= 1)
                    this.bits[i*this.width + j] = word & 1;
            }
        }
    };

    Memory.prototype.update_from_node = function(node) {
        var now = this.network.time;
        if (now > 0) {
            var ntime = node.last_event_time();
            if (ntime !== undefined) {
                var tsetup = now - ntime;
                if (this.min_setup === undefined || tsetup < this.min_setup) {
                    this.min_setup = tsetup;
                    this.min_setup_time = now;
                }
            }
        }
    };

    Memory.prototype.update_min_setup = function(port) {
        this.update_from_node(port.wen);
        var i;
        for (i = 0; i < this.naddr; i += 1) this.update_from_node(port.addr[i]);
        for (i = 0; i < this.width; i += 1) this.update_from_node(port.data[i]);
    };

    // compute value from array of nodes, MSB first.
    // returns undefined if invalid
    Memory.prototype.value = function(narray) {
        var value = 0;
        var node,v;
        for (var i = 0; i < narray.length; i += 1) {
            node = narray[i];
            v = node.v;
            if (v == VX || v == VZ) return undefined;
            value *= 2;  // logical operations limit result to 32 bits
            if (v == V1) value += 1;
        }
        return value;
    };

    // return true if this a read port that is affecting its outputs
    Memory.prototype.active_read_port = function(port,cause) {
        // make sure it's a read port
        if (!port.read_port) return false;

        // port is active if OE just changed or OE != 0 and
        // some address input just changed
        if (cause == port.oe) return true;
        if (port.oe.v != V0 && port.addr.indexOf(cause) != -1) return true;
        return false;
    };

    // schedule propagtion events for data terminals of a read port
    Memory.prototype.update_read_port = function(port) {
        var addr = this.value(port.addr);
        var table = TristateBufferTable[port.oe.v];  // model of tristate driver
        for (var i = 0; i < this.width; i += 1) {
            // MSB of data comes first in the array of data nodes
            var bit = (this.width - 1) - i;
            var v = (addr === undefined || addr >= this.nlocations) ? VX : this.bits[addr*this.width + bit];
            v = table[v][4];   // run it through the tristate driver, get result
            var drive,tpd;
            if (v == V1) { tpd = this.tpdr; drive = this.tr; }
            else if (v == V0) { tpd = this.tpdf; drive = this.tf; }
            else if (v == VZ) { tpd = 0; drive = 0; }  // going HI-Z is fast :)
            else { tpd = Math.min(this.tpdr,this.tpdf); drive = 0; }
            port.data_out[i].p_event(tpd,v,drive,this.lenient);
        }
    };

    // memory location has changed, update read ports looking at that location
    Memory.prototype.location_changed = function(addr) {
        for (var i = 0; i < this.ports.length; i += 1) {
            var port = this.ports[i];
            if (port.read_port && port.oe.v != V0) {
                var paddr = this.value(port.addr);
                // check for address match (X's always match)
                if (addr === undefined || paddr < 0 || paddr == addr)
                    this.update_read_port(port);
            }
        };
    };

    // return true if this a write port that should capture a new data value
    Memory.prototype.active_write_port = function(port,cause) {
        // make sure it's a write port
        if (!port.write_port) return false;

        if (cause == port.clk) {
            if (port.clk.v == V0) port.edge_possible = true;
            else if (port.clk.v == V1 && port.edge_possible) {
                port.edge_possible = false;
                if (port.wen.v != V0) return true;
            }
        }
        return false;
    };

    Memory.prototype.capacitance = function(node) {
        var mem = this;
        var c = 0;
        // check each port to see if node is connected to one of its terminals
        $.each(mem.ports, function (i,port) {
            if (port.clk == node) c += mem.cin;
            if (port.wen == node) c += mem.cin;
            if (port.oe == node) c += mem.cin;
            $.each(port.addr, function (j, dnode) { if (dnode == node) c += mem.cin; });
            $.each(port.data, function (j, dnode) {
                if (dnode == node) {
                    // if there's a possibility of a write, data node is an input
                    if (port.clk != mem.network.gnd || port.wen != mem.network.gnd) c += mem.cin;

                    // if there's a possibility of a read, data node is an output
                    if (port.oe != mem.network.gnd) c += mem.cout;
                }
            });
        });
        return c;
    };

    // is node a tristate output of this device?
    Memory.prototype.tristate = function(node) {
        return this.tristate_outputs.indexOf(node) != -1;
    };

    // evaluation of output values triggered by an event on the input
    Memory.prototype.process_event = function(event,cause) {
        var i,bit,port;

        if (event.type == CONTAMINATE) {
            // look for port outputs affected by cause node
            for (i = 0; i < this.ports.length; i += 1) {
                port = this.ports[i];
                // only read ports have outputs to contaminate
                if (this.active_read_port(port,cause)) {
                    // data pins on port are affected by cause
                    for (bit = 0; bit < this.width; bit += 1)
                        port.data[bit].c_event(this.tcd);
                }
            };
        } else if (event.type == PROPAGATE) {   // PROPAGATE event
            // look for port outputs affected by cause node
            for (i = 0; i < this.ports.length; i += 1) {
                port = this.ports[i];

                if (this.active_read_port(port,cause)) {
                    this.update_read_port(port);
                }

                if (this.active_write_port(port,cause)) {
                    var addr = this.value(port.addr);
                    //console.log('memory '+this.name+'['+addr+']='+this.value(port.data)+' @ '+this.network.time);
                    // write appropriate location(s)
                    if (addr === undefined) {
                        this.clear_memory();
                    } else if (addr < this.nlocations) {
                        for (bit = 0; bit < this.width; bit += 1) {
                            var v = (port.wen.v == V1) ? port.data[bit].v : VX;
                            // MSB of data comes first in the array of data nodes
                            this.bits[addr*this.width + (this.width - 1) - bit] = v;
                        }
                    }

                    this.location_changed(addr);
                    this.update_min_setup(port);
                }
            };
        }
    };

    Memory.prototype.get_timing_info = function(output) {
        var tr = this.tpdr + this.tr*output.capacitance;
        var tf = this.tpdf + this.tf*output.capacitance;
        var tinfo = new TimingInfo(output.name,output,this,this.tcd,Math.max(tr,tf));

        // look for read ports with data connections to output
        for (var i = 0; i < this.ports.length; i += 1) {
            var port = this.ports[i];
            if (!port.read_port) continue;
            // is output connected to this port?
            if (port.data_out.indexOf(output) != -1) {
                // check timing of OE
                tinfo.set_delays(port.oe.get_timing_info());
                // check timing of address inputs
                for (var j = 0; j < this.naddr; j += 1)
                    tinfo.set_delays(port.addr[j].get_timing_info());
            }
        }

        return tinfo;
    };

    Memory.prototype.get_clock_info = function(clk) {
        var tinfo,i,j,port;

        // look for write ports clocked by clk
        for (i = 0; i < this.ports.length; i += 1) {
            port = this.ports[i];
            if (!port.write_port || port.clk != clk) continue;

            if (tinfo === undefined) {
                tinfo = new TimingInfo(clk.name+'\u2191',clk,this,-this.th,this.ts);
            }

            // check timing of write enable
            tinfo.set_delays(port.wen.get_timing_info());

            // check timing of address inputs
            for (j = 0; j < this.naddr; j += 1)
                tinfo.set_delays(port.addr[j].get_timing_info());

            // check timing of data inputs
            for (j = 0; j < this.width; j += 1)
                tinfo.set_delays(port.data[j].get_timing_info());
        }

        return tinfo;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Timing info generated during timing analysis
    //
    ///////////////////////////////////////////////////////////////////////////////

    function TimingInfo(name,node,device,tcd,tpd) {
        this.name = name;  // name to use in reports (sometimes differs from node.name)
        this.node = node;  // associated node
        this.device = device;  // what device determined this info

        this.cd_sum = 0;  // min cummulative tCD from inputs to here
        this.cd_link = undefined;  // previous TimingInfo in tCD path
        this.pd_sum = 0;  // max cummulative tPD from inputs to here
        this.pd_link = undefined;  // previous TimingInfo in tPD path

        this.tcd = tcd || 0;  // specs for driving gate, capacitance accounted for
        this.tpd = tpd || 0;
    }

    TimingInfo.prototype.get_tcd_source = function () {
        var t = this;
        while (t.cd_link !== undefined) t = t.cd_link;
        return {node: t.node, name: t.name};
    };

    TimingInfo.prototype.get_tpd_source = function () {
        var t = this;
        while (t.pd_link !== undefined) t = t.pd_link;
        return {node: t.node, name: t.name};
    };

    // using timing info from an input, updated timing info for associated node
    TimingInfo.prototype.set_delays = function (tinfo) {
        var t;

        // update min tCD
        t = tinfo.cd_sum + this.tcd;
        if (this.cd_link === undefined || t < this.cd_sum) {
            this.cd_link = tinfo;
            this.cd_sum = t;
        }

        // update max tPD
        t = tinfo.pd_sum + this.tpd;
        if (this.pd_link === undefined || t > this.pd_sum) {
            this.pd_link = tinfo;
            this.pd_sum = t;
        }
    };

    function format_float(n,width,decimal_places) {                                                        
        var result = n.toFixed(decimal_places);                                                            
        while (result.length < width) result = ' '+result;                                                 
        return result;                                                                                             
    }                                                                                                      
          
    // recursively describe tPD path
    TimingInfo.prototype.describe_tpd = function () {
        var result;
        if (this.pd_link !== undefined) result = this.pd_link.describe_tpd();
        else result = '';

        var driver_name = (this.device !== undefined) ? ' ['+this.device.name+' '+this.device.type+']' : '';
        result += '    + '+format_float(this.tpd*1e9,6,3)+"ns = "+format_float(this.pd_sum*1e9,6,3)+"ns "+this.name+driver_name+'\n';
        return result;
    };

    // recursively describe tCD path
    TimingInfo.prototype.describe_tcd = function () {
        var result;
        if (this.cd_link !== undefined) result = this.cd_link.describe_tcd();
        else result = '';

        var driver_name = (this.device !== undefined) ? ' ['+this.device.name+']' : '';
        // when calculating hold time violations, tcd for register is negative...
        result += '    '+(this.tcd < 0 ? '-' : '+');
        result += ' '+format_float(Math.abs(this.tcd)*1e9,6,3)+"ns = "+format_float(this.cd_sum*1e9,6,3)+"ns "+this.name+driver_name+'\n';
        return result;
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Module definition
    //
    ///////////////////////////////////////////////////////////////////////////////
    var module = {
        'dc_analysis': dc_analysis,
        'ac_analysis': ac_analysis,
        'transient_analysis': transient_analysis,
        'timing_analysis': timing_analysis,
        'get_last_network': get_last_network
    };
    return module;
};


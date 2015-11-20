// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman and Jacob White

/////////////////////////////////////////////////////////////////////////////
//
//  Circuit simulator
//
//////////////////////////////////////////////////////////////////////////////

jade_defs.cktsim = function(jade) {

    // JSON circuit description: [{type: device_type,
    //                             connections: {port_name: signal, ...},
    //                             properties: {prop_name: value, ...}} ... ]
    // device_type is one of
    //    "resistor"            ports: n1, n2; properties: value, name
    //    "capacitor"           ports: n1, n2; properties: value, name
    //    "inductor"            ports: n1, n2; properties: value, name
    //    "diode"               ports: anode, cathode; properties: area, type, name
    //    "opamp"               ports: nplus, nminus, output, gnd; properties: A, name
    //    "nfet"                ports: d, g, s; properties: W, L, name
    //    "pfet"                ports: d, g, s; properties: W, L, name
    //    "voltage source"      ports: nplus, nminus; properties: value=src, name
    //    "current source"      ports: nplus, nminus; properties: value=src, name
    //    "connect"             ports are all aliases for the same electrical node
    //    "ground"              connections is list of aliases for gnd
    //    "initial voltage"     ports: node; properties: IV, name
    // signals are just strings
    // src == {type: function_name, args: [number, ...]}

    // handy for debugging :)
    function print_netlist(netlist) {
        $.each(netlist,function(index,c) {
            var connections = [];
            for (var port in c.connections) connections.push(port+"="+c.connections[port]);
            var properties = [];
            for (var prop in c.properties) properties.push(prop+"="+JSON.stringify(c.properties[prop]));
            console.log(c.type + ' ' + connections.join(' ') + '; ' + properties.join(' '));
        });
    }

    // DC Analysis
    //   netlist: JSON description of the circuit
    //   returns associative array mapping node names -> DC value
    //   throws a string to report errors
    function dc_analysis(netlist, sweep1, sweep2, options) {
        if (netlist.length > 0) {
            var ckt = new Circuit(netlist, options || {});

            var source1, start1, stop1, step1, source1_saved_src;
            var source2, start2, stop2, step2, source2_saved_src;

            if (sweep1.source) {
                source1 = ckt.device_map[sweep1.source.toLowerCase()];
                if (source1 instanceof VSource) sweep1.units= 'V';
                else if (source1 instanceof ISource) sweep1.units= 'A';
                else throw "Device 1 not independent source in DC sweep: " + sweep1.source;
                start1 = sweep1.start;
                stop1 = sweep1.stop;
                step1 = sweep1.step;
                // make sure sign of step is compatible with bounds
                if (start1 <= stop1) step1 = Math.abs(step1);
                else step1 = -Math.abs(step1);
                // save source function user specified
                source1_saved_src = source1.src;
            }

            if (sweep2.source) {
                source2 = ckt.device_map[sweep2.source.toLowerCase()];
                if (source2 instanceof VSource) sweep2.units= 'V';
                else if (source2 instanceof ISource) sweep2.units= 'A';
                else throw "Device 2 not independent source in DC sweep: " + sweep2.source;
                start2 = sweep2.start;
                stop2 = sweep2.stop;
                step2 = sweep2.step;
                // make sure sign of step is compatible with bounds
                if (start2 <= stop2) step2 = Math.abs(step2);
                else step2 = -Math.abs(step2);
                // save source function user specified
                source2_saved_src = source2.src;
            }

            // do the sweeps
            var val1 = start1;
            var val2 = start2;
            var results = {
                _sweep1_: [],
                _network_: ckt
            }; // remember sweep1 values as one of the"results
            var results2 = [];
            while (true) {
                // start by setting source values
                if (source1) source1.src = jade.utils.parse_source({type: 'dc', args: [val1]});
                if (source2) source2.src = jade.utils.parse_source({type: 'dc', args: [val2]});

                // do DC analysis, add result to accumulated results for each node and branch
                var result = ckt.dc(true);
                for (var n in result) {
                    if (n == '_network_') continue;
                    if (results[n] === undefined) results[n] = [];
                    results[n].push(result[n]);
                }
                results._sweep1_.push(val1); // keep track of sweep settings
                results._sweep2_ = val2; // remember sweep2 value as one of the results

                if (val1 === undefined) break;
                else if (Math.abs(val1 - stop1) < Math.abs(0.01*step1)) {
                    // end of sweep for first source
                    if (val2 === undefined) break;
                    results2.push(results); // accumulate results from first sweep
                    // check to see if we're done
                    if (Math.abs(val2 - stop2) < Math.abs(0.01*step2)) {
                        results = results2; // use accumlated results when there are two sweeps
                        break;
                    }
                    // start first source over again
                    results = {
                        _sweep1_: [],
                        _network_: ckt
                    };
                    val1 = start1;
                    // increment second sweep value, make sure we stop at specified end point
                    val2 += step2;
                    if ((step2 > 0 && val2 > stop2) || (step2 < 0 && val2 < stop2)) val2 = stop2;
                }
                else {
                    // increment first sweep value, make sure we stop at specified end point
                    val1 += step1;
                    if ((step1 > 0 && val1 > stop1) || (step1 < 0 && val1 < stop1)) val1 = stop1;
                }
            }
            // all done, restore saved source functions
            if (source1_saved_src !== undefined) source1.src = source1_saved_src;
            if (source2_saved_src !== undefined) source2.src = source2_saved_src;

            // for no sweep or one sweep: results is dictionary of arrays giving DC results
            // for two sweeps: results is an array containing the first sweep results for each
            //   sweep value of the second source
            return results;
        }
        return undefined;
    }

    // AC analysis
    //   netlist: JSON description of the circuit
    //   fstart: starting frequency in Hz
    //   fstop: ending frequency in Hz
    //   ac_source_name: string giving name of source element where small
    //                   signal is injected
    //   returns associative array mapping <node name> -> {magnitude: val, phase: val}
    function ac_analysis(netlist, fstart, fstop, ac_source_name, options) {
        var npts = 50;

        if (netlist.length > 0) {
            var ckt = new Circuit(netlist, options || {});
            return ckt.ac(npts, fstart, fstop, ac_source_name);
        }
        return undefined;
    }

    // Transient analysis
    //   netlist: JSON description of the circuit
    //   tstop: stop time of simulation in seconds
    //   probe_names: optional list of node names to be checked during LTE calculations
    //   progress_callback(percent_complete,results)
    //      function called periodically, return true to halt simulation
    //      until simulation is complete, results are undefined
    // results are associative array mapping node name -> object with attributes
    //   xvalues -> array of simulation times at which yvalues were measured
    //   yvalues -> array of voltages/currents
    function transient_analysis(netlist, tstop, probe_names, progress_callback, options) {
        if (netlist.length > 0 && tstop !== undefined) {
            try {
                var ckt = new Circuit(netlist, options || {});
            }
            catch (e) {
                if (e instanceof Error) e = e.stack.split('\n').join('<br>');
                progress_callback(undefined,e.toString());
                return undefined;
            }

            var progress = {};
            progress.probe_names = probe_names, // node names for LTE check
            progress.update_interval = 250; // in milliseconds
            progress.finish = function(results) {
                progress_callback(undefined, results);
            };
            progress.stop_requested = false;
            progress.update = function(percent_complete) { // 0 - 100
                // invoke the callback which will return true if the
                // simulation should halt.
                if (progress_callback(percent_complete, undefined)) progress.stop_requested = true;
            };

            // give system time to show progress bar before we start simulation
            setTimeout(function() {
                try {
                    ckt.tran_start(progress, 100, 0, tstop);
                }
                catch (e) {
                    if (e instanceof Error) e = e.stack.split('\n').join('<br>');
                    progress.finish(e);
                }
            }, 1);

            // simulator will handle the rest...
            return undefined;
        }
        return undefined;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Circuit analysis
    //
    //////////////////////////////////////////////////////////////////////////////

    // types of "nodes" in the linear system
    var T_VOLTAGE = 0;
    var T_CURRENT = 1;

    var v_newt_lim = 0.3; // Voltage limited Newton great for Mos/diodes
    var v_abstol = 1e-6; // Absolute voltage error tolerance
    var i_abstol = 1e-12; // Absolute current error tolerance
    var eps = 1.0e-12; // A very small number compared to one.
    var dc_max_iters = 1000; // max iterations before giving pu
    var max_tran_iters = 20; // max iterations before giving up
    var time_step_increase_factor = 2.0; // How much can lte let timestep grow.
    var lte_step_decrease_factor = 8; // Limit lte one-iter timestep shrink.
    var nr_step_decrease_factor = 4; // Newton failure timestep shink.
    var reltol = 0.0001; // Relative tol to max observed value
    var lterel = 10; // LTE/Newton tolerance ratio (> 10!)
    var res_check_abs = Math.sqrt(i_abstol); // Loose Newton residue check
    var res_check_rel = Math.sqrt(reltol); // Loose Newton residue check

    function Circuit(netlist, options) {
        if (options) {
            if (options.v_abstol) v_abstol = options.v_abstol;
            if (options.i_abstol) { i_abstol = options.ia_abstol; res_check_abs = Math.sqrt(i_abstol); }
            if (options.reltol) { reltol = options.reltol; res_check_rel = Math.sqrt(reltol); }
        }

        this.node_map = {};
        this.ntypes = [];

        this.devices = []; // list of devices
        this.device_map = {}; // map name -> device
        this.voltage_sources = []; // list of voltage sources
        this.current_sources = []; // list of current sources
        this.initial_voltages = [];

        this.finalized = false;
        this.diddc = false;
        this.node_index = -1;

        this.periods = 1;

        if (netlist !== undefined) this.load_netlist(netlist);
    }

    Circuit.prototype.history = function(node) {
        if (this.result === undefined || this.result[node] === undefined)
            return undefined;
        var yvalues = this.result[node];
        if (typeof yvalues == 'number') {
            // change a single numeric value into an array of that value
            var y = yvalues;
            yvalues = this.result._xvalues_.slice();
            for (var i = 0; i < yvalues.length; i += 1) yvalues[i] = y;
            this.result[node] = yvalues;
        }
        return {xvalues: this.result._xvalues_, yvalues: yvalues};
    };

    Circuit.prototype.result_type = function() { return 'analog'; };

    Circuit.prototype.node_list = function() {
        var nlist = [];
        for (var n in this.results) nlist.push(n);
        return nlist;
    };

    // index of ground node
    Circuit.prototype.gnd_node = function() {
        return -1;
    };

    // allocate a new node index
    Circuit.prototype.node = function(name, ntype) {
        this.node_index += 1;
        if (name) this.node_map[name] = this.node_index;
        this.ntypes.push(ntype);
        return this.node_index;
    };

    // call to finalize the circuit in preparation for simulation
    Circuit.prototype.finalize = function() {
        if (!this.finalized) {
            this.finalized = true;
            this.N = this.node_index + 1; // number of nodes

            // give each device a chance to finalize itself
            for (var i = this.devices.length - 1; i >= 0; i -= 1) {
                this.devices[i].finalize(this);
            }

            // set up augmented matrix and various temp vectors
            this.matrix = mat_make(this.N, this.N + 1);
            this.Gl = mat_make(this.N, this.N); // Matrix for linear conductances
            this.G = mat_make(this.N, this.N); // Complete conductance matrix
            this.C = mat_make(this.N, this.N); // Matrix for linear L's and C's

            this.soln_max = new Array(this.N); // max abs value seen for each unknown
            this.abstol = new Array(this.N);
            this.solution = new Array(this.N);
            this.rhs = new Array(this.N);
            for (i = this.N - 1; i >= 0; i -= 1) {
                this.soln_max[i] = 0.0;
                this.abstol[i] = this.ntypes[i] == T_VOLTAGE ? v_abstol : i_abstol;
                this.solution[i] = 0.0;
                this.rhs[i] = 0.0;
            }

            // apply any initial voltages
            for (i = 0; i < this.initial_voltages.length; i += 1) {
                var node = this.initial_voltages[i].node;
                var v = this.initial_voltages[i].v;
                this.solution[node] = v;
                this.soln_max[node] = v;
            }

            // Load up the linear elements once and for all
            for (i = this.devices.length - 1; i >= 0; i -= 1) {
                this.devices[i].load_linear(this);
            }

            // Check for voltage source loops. 
            var n_vsrc = this.voltage_sources.length;
            if (n_vsrc > 0) { // At least one voltage source
                var GV = mat_make(n_vsrc, this.N); // Loop check
                for (i = n_vsrc - 1; i >= 0; i -= 1) {
                    var branch = this.voltage_sources[i].branch;
                    for (var j = this.N - 1; j >= 0; j -= 1) {
                        GV[i][j] = this.Gl[branch][j];
                    }
                }
                var rGV = mat_rank(GV);
                if (rGV < n_vsrc) {
                    throw 'Warning!!! Circuit has a voltage source loop or a source or current probe shorted by a wire, please remove the source or the wire causing the short.';
                }
            }
        }
        return true;
    };

    // load circuit from JSON netlist: [[device,[connections,...],{prop: value,...}]...]
    Circuit.prototype.load_netlist = function(netlist) {
        var i, j, c, component, connections, node;

        // set up mapping for all ground connections
        for (i = netlist.length - 1; i >= 0; i -= 1) {
            if (netlist[i].type == 'ground') {
                connections = netlist[i].connections;
                for (j = 0; j < connections.length; j += 1) {
                    c = connections[j];
                    this.node_map[c] = this.gnd_node();
                }
            }
        }

        // "connect a b ..." makes a, b, ... aliases for the same node
        var aliases = {};   // keep track of canonical name for a node
        for (i = netlist.length - 1; i >= 0; i -= 1) {
            if (netlist[i].type == 'connect') {
                connections = netlist[i].connections;
                if (connections.length <= 1) continue;
                // see if any of the connected nodes is a ground node.
                // if so, make it the canonical name. Otherwise just choose
                // connections[0] as the canonical name.
                var cname = connections[0];
                for (j = 1; j < connections.length; j += 1) {
                    c = connections[j];
                    if (this.node_map[c] !== undefined) {
                        cname = c;
                        break;
                    }
                }
                while (aliases[cname] !== undefined) cname = aliases[cname];  // follow alias chain
                // so make all the other connected nodes aliases for the canonical name
                for (j = 1; j < connections.length; j += 1) {
                    c = connections[j];
                    while (aliases[c] !== undefined) c = aliases[c];  // follow alias chain
                    if (cname != c) aliases[c] = cname;
                }
            }
        }

        // process each component in the JSON netlist (see schematic.js for format)
        var found_ground = false; // is some component hooked to gnd?
        this.counts = {};
        for (i = netlist.length - 1; i >= 0; i -= 1) {
            component = netlist[i];
            var type = component.type;
            var properties = component.properties;

            this.counts[type] = (this.counts[type] || 0) + 1;

            // convert node names to circuit indicies
            var connections = {};
            for (c in component.connections) {
                node = component.connections[c];
                while (aliases[node] !== undefined) node = aliases[node];  // follow alias chain
                var index = this.node_map[node];
                if (index === undefined) index = this.node(node, T_VOLTAGE);
                else if (index == this.gnd_node()) found_ground = true;
                connections[c] = index;
            }

            // process the component
            var name = properties.name;
            switch (type) {
            case 'resistor':
                this.r(connections.n1, connections.n2, properties.value, name);
                break;
            case 'diode':
                this.d(connections.anode, connections.cathode, properties.area, properties.type, name);
                break;
            case 'capacitor':
                this.c(connections.n1, connections.n2, properties.value, name);
                break;
            case 'inductor':
                break;
            case 'voltage source':
                this.v(connections.nplus, connections.nminus, properties.value, name);
                break;
            case 'current source':
                this.i(connections.nplus, connections.nminus, properties.value, name);
                break;
            case 'opamp':
                this.opamp(connections.nplus, connections.nminus, connections.output, connections.gnd, properties.A, name);
                break;
            case 'nfet':
                this.n(connections.d, connections.g, connections.s, properties.W, properties.L, name);
                break;
            case 'pfet':
                this.p(connections.d, connections.g, connections.s, properties.W, properties.L, name);
                break;
            case 'voltage probe':
                break;
            case 'ground':
                break;
            case 'connect':
                break;  
            case 'initial voltage':
                this.initial_voltages.push({node: connections.node, v:properties.IV});
                break;
            default:
                throw 'Unrecognized device type ' + type;
            }
        }

        if (!found_ground) { // No ground connection from some device
            throw 'Please make at least one connection to ground (node gnd)';
        }
        
        // finally, update node_map to reflect aliases created by .connect
        for (node in aliases) {
            c = node;
            while (aliases[c] !== undefined) c = aliases[c];  // follow alias chain
            // if there's an node index for the canonical node add an entry in node_map for node -> index
            i = this.node_map[c];
            if (i !== undefined) this.node_map[node] = i;
        }

        // discover CMOS gates for later analysis
        this.find_cmos_gates();

        // report circuit stats
        var msg = (this.node_index + 1).toString() + ' nodes';
        this.size = 0;
        for (var d in this.counts) {
            msg += ', ' + this.counts[d].toString() + ' ' + d;
            this.size += this.counts[d];
        }
        console.log(msg);
    };  

    Circuit.prototype.find_cmos_gates = function() {
        // for each fet, record its source/drain connectivity
        var source_drain = {};
        $.each(this.devices,function (index,d) {
                if (d instanceof Fet) {
                    if (source_drain[d.d] === undefined) source_drain[d.d] = [];
                    source_drain[d.d].push(d);

                    if (source_drain[d.s] === undefined) source_drain[d.s] = [];
                    source_drain[d.s].push(d);
                }
        });
        //console.log(source_drain);

        // find output nodes of CMOS gates by looking for nodes that connect
        // to both P and N fets
        var cmos_outputs = [];
        $.each(source_drain,function (node,fets) {
                var found_n = false;
                var found_p = false;
                $.each(fets,function (index,fet) {
                        if (fet.type_sign == 1) found_n = true;
                        else found_p = true;
                });
                if (found_n && found_p) cmos_outputs.push(node);
        });

        //console.log(cmos_outputs);
        this.counts['cmos_gates'] = cmos_outputs.length;
    };

    // if converges: updates this.solution, this.soln_max, returns iter count
    // otherwise: return undefined and set this.problem_node
    // Load should compute -f and df/dx (note the sign pattern!)
    Circuit.prototype.find_solution = function(load, maxiters) {
        var soln = this.solution;
        var rhs = this.rhs;
        var d_sol = [];
        var abssum_compare;
        var converged, abssum_old = 0,
            abssum_rhs;
        var use_limiting = false;
        var down_count = 0;

        // iteratively solve until values converge or iteration limit exceeded
        for (var iter = 0; iter < maxiters; iter += 1) {
            var i;

            // set up equations
            load.call(this, soln, rhs); // load should be a method of Circuit

            // Compute norm of rhs, assume variables of v type go with eqns of i type
            abssum_rhs = 0;
            for (i = this.N - 1; i >= 0; i -= 1) {
                if (this.ntypes[i] == T_VOLTAGE) abssum_rhs += Math.abs(rhs[i]);
            }

            if ((iter > 0) && (use_limiting === false) && (abssum_old < abssum_rhs)) {
                // Old rhsnorm was better, undo last iter and turn on limiting
                for (i = this.N - 1; i >= 0; i -= 1) {
                    soln[i] -= d_sol[i];
                }
                iter -= 1;
                use_limiting = true;
            }
            else { // Compute the Newton delta
                //d_sol = mat_solve(this.matrix,rhs);
                d_sol = mat_solve_rq(this.matrix, rhs);

                // If norm going down for ten iters, stop limiting
                if (abssum_rhs < abssum_old) down_count += 1;
                else down_count = 0;
                if (down_count > 10) {
                    use_limiting = false;
                    down_count = 0;
                }

                // Update norm of rhs
                abssum_old = abssum_rhs;
            }

            // Update the worst case abssum for comparison.
            if ((iter === 0) || (abssum_rhs > abssum_compare)) abssum_compare = abssum_rhs;

            // Check residue convergence, but loosely, and give up 
            // on last iteration
            if ((iter < (maxiters - 1)) && (abssum_rhs > (res_check_abs + res_check_rel * abssum_compare))) converged = false;
            else converged = true;


            // Update solution and check delta convergence
            for (i = this.N - 1; i >= 0; i -= 1) {
                // Simple voltage step limiting to encourage Newton convergence
                if (use_limiting) {
                    if (this.ntypes[i] == T_VOLTAGE) {
                        d_sol[i] = (d_sol[i] > v_newt_lim) ? v_newt_lim : d_sol[i];
                        d_sol[i] = (d_sol[i] < -v_newt_lim) ? -v_newt_lim : d_sol[i];
                    }
                }
                soln[i] += d_sol[i];
                var thresh = this.abstol[i] + reltol * this.soln_max[i];
                if (Math.abs(d_sol[i]) > thresh) {
                    converged = false;
                    this.problem_node = i;
                }
            }

            //alert(numeric.prettyPrint(this.solution);)
            if (converged === true) {
                for (i = this.N - 1; i >= 0; i -= 1) {
                    if (Math.abs(soln[i]) > this.soln_max[i]) this.soln_max[i] = Math.abs(soln[i]);
                }

                return iter + 1;
            }
        }
        return undefined;
    };

    // Define -f and df/dx for Newton solver
    Circuit.prototype.load_dc = function(soln, rhs) {
        // rhs is initialized to -Gl * soln
        mat_v_mult(this.Gl, soln, rhs, - 1.0);
        // G matrix is initialized with linear Gl
        mat_copy(this.Gl, this.G);
        // Now load up the nonlinear parts of rhs and G
        for (var i = this.devices.length - 1; i >= 0; i -= 1) {
            this.devices[i].load_dc(this, soln, rhs);
        }
        // G matrix is copied in to the system matrix
        mat_copy(this.G, this.matrix);
    };

    // DC analysis
    Circuit.prototype.dc = function(report_results) {

        // Allocation matrices for linear part, etc.
        if (this.finalize() === false) return undefined;

        // find the operating point
        var iterations = this.find_solution(Circuit.prototype.load_dc, dc_max_iters);

        if (typeof iterations == 'undefined') {
            // too many iterations
            if (report_results) {
                if (this.current_sources.length > 0) {
                    throw 'Unable to find circuit\'s operating point: do your current sources have a conductive path to ground?';
                }
                else {
                    throw 'Unable to find circuit\'s operating point: is there a loop in your circuit that\'s oscillating?';
                }
            } else return false;
        }
        else {
            // Note that a dc solution was computed
            this.diddc = true;
            if (report_results) {
                // create solution dictionary
                this.result = {};
                // capture node voltages
                for (var name in this.node_map) {
                    var index = this.node_map[name];
                    this.result[name] = (index == -1) ? 0 : this.solution[index];
                }
                // capture branch currents from voltage sources
                for (var i = this.voltage_sources.length - 1; i >= 0; i -= 1) {
                    var v = this.voltage_sources[i];
                    this.result['I(' + v.name + ')'] = this.solution[v.branch];
                }
                this.result._network_ = this;   // for later reference
                return this.result;
            } else return true;
        }
    };

    // initialize everything for transient analysis
    Circuit.prototype.tran_start = function(progress, ntpts, tstart, tstop) {
        var i;

        // Standard to do a dc analysis before transient
        // Otherwise, do the setup also done in dc.
        if (this.diddc === false) {
            if (!this.dc(false)) { // DC failed, realloc mats and vects.
                //throw 'DC failed, trying transient analysis from zero.';
                this.finalized = false; // Reset the finalization.
                if (this.finalize() === false) progress.finish(undefined); // nothing more to do
            }
        }
        else if (this.finalize() === false) // Allocate matrices and vectors.
            progress.finish(undefined); // nothing more to do

        // build array to hold list of results for each variable
        // last entry is for timepoints.
        this.response = new Array(this.N + 1);
        for (i = this.N; i >= 0; i -= 1) {
            this.response[i] = [];
        }

        // Allocate back vectors for up to a second order method
        this.old3sol = new Array(this.N);
        this.old3q = new Array(this.N);
        this.old2sol = new Array(this.N);
        this.old2q = new Array(this.N);
        this.oldsol = new Array(this.N);
        this.oldq = new Array(this.N);
        this.q = new Array(this.N);
        this.oldc = new Array(this.N);
        this.c = new Array(this.N);
        this.alpha0 = 1.0;
        this.alpha1 = 0.0;
        this.alpha2 = 0.0;
        this.beta0 = new Array(this.N);
        this.beta1 = new Array(this.N);

        // Mark a set of algebraic variable (don't miss hidden ones!).
        this.ar = this.algebraic(this.C);

        // Non-algebraic variables and probe variables get lte
        this.ltecheck = new Array(this.N);
        for (i = this.N; i >= 0; i -= 1) {
            this.ltecheck[i] = (this.ar[i] === 0);
        }

        for (var name in this.node_map) {
            var index = this.node_map[name];
            for (i = progress.probe_names.length - 1; i >= 0; i -= 1) {
                if (name == progress.probe_names[i]) {
                    this.ltecheck[index] = true;
                    break;
                }
            }
        }

        // Check for periodic sources
        var period = tstop - tstart;
        var per;
        for (i = this.voltage_sources.length - 1; i >= 0; i -= 1) {
            per = this.voltage_sources[i].src.period;
            if (per > 0) period = Math.min(period, per);
        }
        for (i = this.current_sources.length - 1; i >= 0; i -= 1) {
            per = this.current_sources[i].src.period;
            if (per > 0) period = Math.min(period, per);
        }
        this.periods = Math.ceil((tstop - tstart) / period);
        // maximum 50000 steps/period
        this.max_nsteps = this.periods * 50000;

        this.time = tstart;
        // ntpts adjusted by numbers of periods in input
        this.max_step = (tstop - tstart) / (this.periods * ntpts);
        this.min_step = this.max_step / 1e8;
        this.new_step = this.max_step / 1e6;
        this.oldt = this.time - this.new_step;

        // Initialize old crnts, charges, and solutions.
        this.load_tran(this.solution, this.rhs);
        for (i = this.N - 1; i >= 0; i -= 1) {
            this.old3sol[i] = this.solution[i];
            this.old2sol[i] = this.solution[i];
            this.oldsol[i] = this.solution[i];
            this.old3q[i] = this.q[i];
            this.old2q[i] = this.q[i];
            this.oldq[i] = this.q[i];
            this.oldc[i] = this.c[i];
        }

        // now for the real work
        this.tstart = tstart;
        this.tstop = tstop;
        this.progress = progress;
        this.step_index = -3; // Start with two pseudo-Euler steps

        try {
            this.tran_steps(new Date().getTime() + progress.update_interval);
        }
        catch (e) {
            progress.finish(e);
        }
    };

    Circuit.prototype.pick_step = function() {
        var min_shrink_factor = 1.0 / lte_step_decrease_factor;
        var max_growth_factor = time_step_increase_factor;

        // Poly coefficients
        var dtt0 = (this.time - this.oldt);
        var dtt1 = (this.time - this.old2t);
        var dtt2 = (this.time - this.old3t);
        var dt0dt1 = (this.oldt - this.old2t);
        var dt0dt2 = (this.oldt - this.old3t);
        var dt1dt2 = (this.old2t - this.old3t);
        var p0 = (dtt1 * dtt2) / (dt0dt1 * dt0dt2);
        var p1 = (dtt0 * dtt2) / (-dt0dt1 * dt1dt2);
        var p2 = (dtt0 * dtt1) / (dt0dt2 * dt1dt2);

        var trapcoeff = 0.5 * (this.time - this.oldt) / (this.time - this.old3t);
        var maxlteratio = 0.0;
        for (var i = this.N - 1; i >= 0; i -= 1) {
            if (this.ltecheck[i]) { // Check lte on variable
                var pred = p0 * this.oldsol[i] + p1 * this.old2sol[i] + p2 * this.old3sol[i];
                var lte = Math.abs((this.solution[i] - pred)) * trapcoeff;
                var lteratio = lte / (lterel * (this.abstol[i] + reltol * this.soln_max[i]));
                maxlteratio = Math.max(maxlteratio, lteratio);
            }
        }
        var new_step;
        var lte_step_ratio = 1.0 / Math.pow(maxlteratio, 1 / 3); // Cube root because trap
        if (lte_step_ratio < 1.0) { // Shrink the timestep to make lte
            lte_step_ratio = Math.max(lte_step_ratio, min_shrink_factor);
            new_step = (this.time - this.oldt) * 0.75 * lte_step_ratio;
            new_step = Math.max(new_step, this.min_step);
        }
        else {
            lte_step_ratio = Math.min(lte_step_ratio, max_growth_factor);
            if (lte_step_ratio > 1.2) /* Increase timestep due to lte. */
            new_step = (this.time - this.oldt) * lte_step_ratio / 1.2;
            else new_step = (this.time - this.oldt);
            new_step = Math.min(new_step, this.max_step);
        }
        return new_step;
    };

    // Define -f and df/dx for Newton solver
    Circuit.prototype.load_tran = function(soln, rhs) {
        // Crnt is initialized to -Gl * soln
        mat_v_mult(this.Gl, soln, this.c, - 1.0);
        // G matrix is initialized with linear Gl
        mat_copy(this.Gl, this.G);
        // Now load up the nonlinear parts of crnt and G
        for (var i = this.devices.length - 1; i >= 0; i -= 1) {
            this.devices[i].load_tran(this, soln, this.c, this.time);
        }
        // Exploit the fact that storage elements are linear
        mat_v_mult(this.C, soln, this.q, 1.0);
        // -rhs = c - dqdt
        for (i = this.N - 1; i >= 0; i -= 1) {
            var dqdt = this.alpha0 * this.q[i] + this.alpha1 * this.oldq[i] + this.alpha2 * this.old2q[i];
            //alert(numeric.prettyPrint(dqdt));
            rhs[i] = this.beta0[i] * this.c[i] + this.beta1[i] * this.oldc[i] - dqdt;
        }
        // matrix = beta0*G + alpha0*C.
        mat_scale_add(this.G, this.C, this.beta0, this.alpha0, this.matrix);
    };

    // here's where the real work is done
    // tupdate is the time we should update progress bar
    Circuit.prototype.tran_steps = function(tupdate) {
        var i;

        if (!this.progress.stop_requested) // halt when user clicks stop
        while (this.step_index < this.max_nsteps) {
            // Save the just computed solution, and move back q and c.
            for (i = this.N - 1; i >= 0; i -= 1) {
                if (this.step_index >= 0) this.response[i].push(this.solution[i]);
                this.oldc[i] = this.c[i];
                this.old3sol[i] = this.old2sol[i];
                this.old2sol[i] = this.oldsol[i];
                this.oldsol[i] = this.solution[i];
                this.old3q[i] = this.oldq[i];
                this.old2q[i] = this.oldq[i];
                this.oldq[i] = this.q[i];
            }

            if (this.step_index < 0) { // Take a prestep using BE
                this.old3t = this.old2t - (this.oldt - this.old2t);
                this.old2t = this.oldt - (this.tstart - this.oldt);
                this.oldt = this.tstart - (this.time - this.oldt);
                this.time = this.tstart;
                this._beta0 = 1.0;
                this._beta1 = 0.0;
            }
            else { // Take a regular step
                // Save the time, and rotate time wheel
                this.response[this.N].push(this.time);
                this.old3t = this.old2t;
                this.old2t = this.oldt;
                this.oldt = this.time;
                // Make sure we come smoothly in to the interval end.
                if (this.time >= this.tstop) break; // We're done!
                else if (this.time + this.new_step > this.tstop) this.time = this.tstop;
                else if (this.time + 1.5 * this.new_step > this.tstop) this.time += (2 / 3) * (this.tstop - this.time);
                else this.time += this.new_step;

                // Use trap (average old and new crnts.
                this._beta0 = 0.5;
                this._beta1 = 0.5;
            }

            // For trap rule, turn off current avging for algebraic eqns
            for (i = this.N - 1; i >= 0; i -= 1) {
                this.beta0[i] = this._beta0 + this.ar[i] * this._beta1;
                this.beta1[i] = (1.0 - this.ar[i]) * this._beta1;
            }

            // Loop to find NR converging timestep with okay LTE
            while (true) {
                // Set the timestep coefficients (alpha2 is for bdf2).
                this.alpha0 = 1.0 / (this.time - this.oldt);
                this.alpha1 = -this.alpha0;
                this.alpha2 = 0;

                // If timestep is 1/10,000th of tstop, just use BE.
                if ((this.time - this.oldt) < 1.0e-4 * this.tstop) {
                    for (i = this.N - 1; i >= 0; i -= 1) {
                        this.beta0[i] = 1.0;
                        this.beta1[i] = 0.0;
                    }
                }
                // Use Newton to compute the solution.
                var iterations = this.find_solution(Circuit.prototype.load_tran, max_tran_iters);

                // If NR succeeds and stepsize is at min, accept and newstep=maxgrowth*minstep.
                // Else if Newton Fails, shrink step by a factor and try again
                // Else LTE picks new step, if bigger accept current step and go on.
                if ((iterations !== undefined) && (this.step_index <= 0 || (this.time - this.oldt) < (1 + reltol) * this.min_step)) {
                    if (this.step_index > 0) this.new_step = time_step_increase_factor * this.min_step;
                    break;
                }
                else if (iterations === undefined) { // NR nonconvergence, shrink by factor
                    //alert('timestep nonconvergence ' + this.time + ' ' + this.step_index);
                    this.time = this.oldt + (this.time - this.oldt) / nr_step_decrease_factor;
                }
                else { // Check the LTE and shrink step if needed.
                    this.new_step = this.pick_step();
                    if (this.new_step < (1.0 - reltol) * (this.time - this.oldt)) {
                        this.time = this.oldt + this.new_step; // Try again   
                    }
                    else break; // LTE okay, new_step for next step
                }
            }

            this.step_index += 1;

            var t = new Date().getTime();
            if (t >= tupdate) {
                // update progress bar
                var completed = Math.round(100 * (this.time - this.tstart) / (this.tstop - this.tstart));
                this.progress.update(completed);

                // a brief break in the action to allow progress bar to update
                // then pick up where we left off
                var ckt = this;
                setTimeout(function() {
                    try {
                        ckt.tran_steps(t + ckt.progress.update_interval);
                    }
                    catch (e) {
                        ckt.progress.finish(e);
                    }
                }, 1);
                // our portion of the work is done
                return;
            }
        }

        // analysis complete -- create solution dictionary
        this.result = {};
        for (var name in this.node_map) {
            var index = this.node_map[name];
            this.result[name] = (index == -1) ? 0 : this.response[index];
        }
        // capture branch currents from voltage sources
        for (i = this.voltage_sources.length - 1; i >= 0; i -= 1) {
            var v = this.voltage_sources[i];
            this.result['I(' + v.name + ')'] = this.response[v.branch];
        }
        this.result._xvalues_ = this.response[this.N];
        this.result._network_ = this;    // for later reference

        //this.progress.finish(result);
        throw this.result;
    };

    // AC analysis: npts/decade for freqs in range [fstart,fstop]
    // result._frequencies_ = vector of log10(sample freqs)
    // result['xxx'] = vector of dB(response for node xxx)
    Circuit.prototype.ac = function(npts, fstart, fstop, source_name) {
        var i;

        this.dc(true);  // make sure we can find operating point

        var N = this.N;
        var G = this.G;
        var C = this.C;

        // Complex numbers, we're going to need a bigger boat
        var matrixac = mat_make(2 * N, (2 * N) + 1);

        // Get the source used for ac
        source_name = source_name.toLowerCase();
        if (this.device_map[source_name] === undefined) {
            throw 'AC analysis refers to unknown source ' + source_name;
        }
        this.device_map[source_name].load_ac(this, this.rhs);

        // build array to hold list of magnitude and phases for each node
        // last entry is for frequency values
        var response = new Array(2 * N + 1);
        for (i = 2 * N; i >= 0; i -= 1) {
            response[i] = [];
        }

        // multiplicative frequency increase between freq points
        var delta_f = Math.exp(Math.LN10 / npts);

        var phase_offset = new Array(N);
        for (i = N - 1; i >= 0; i -= 1) {
            phase_offset[i] = 0;
        }

        var f = fstart;
        fstop *= 1.0001; // capture that last freq point!
        while (f <= fstop) {
            var omega = 2 * Math.PI * f;
            response[2 * N].push(f); // 2*N for magnitude and phase

            // Find complex x+jy that sats Gx-omega*Cy=rhs; omega*Cx+Gy=0
            // Note: solac[0:N-1]=x, solac[N:2N-1]=y
            for (i = N - 1; i >= 0; i -= 1) {
                // First the rhs, replicated for real and imaginary
                matrixac[i][2 * N] = this.rhs[i];
                matrixac[i + N][2 * N] = 0;

                for (var j = N - 1; j >= 0; j -= 1) {
                    matrixac[i][j] = G[i][j];
                    matrixac[i + N][j + N] = G[i][j];
                    matrixac[i][j + N] = -omega * C[i][j];
                    matrixac[i + N][j] = omega * C[i][j];
                }
            }

            // Compute the small signal response
            var solac = mat_solve(matrixac, null);

            // Save magnitude and phase
            for (i = N - 1; i >= 0; i -= 1) {
                var mag = Math.sqrt(solac[i] * solac[i] + solac[i + N] * solac[i + N]);
                response[i].push(mag);     //cjt 20 * Math.log(mag) / Math.LN10); //dB

                // Avoid wrapping phase, add or sub 180 for each jump
                var phase = 180 * (Math.atan2(solac[i + N], solac[i]) / Math.PI);
                var phasei = response[i + N];
                var L = phasei.length;
                // Look for a one-step jump greater than 90 degrees
                if (L > 1) {
                    var phase_jump = phase + phase_offset[i] - phasei[L - 1];
                    if (phase_jump > 90) {
                        phase_offset[i] -= 360;
                    }
                    else if (phase_jump < -90) {
                        phase_offset[i] += 360;
                    }
                }
                response[i + N].push(phase + phase_offset[i]);
            }
            f *= delta_f; // increment frequency
        }

        // create solution dictionary
        this.result = {};
        for (var name in this.node_map) {
            var index = this.node_map[name];
            this.result[name] = {
                magnitude: (index == -1) ? 0 : response[index],
                phase: (index == -1) ? 0 : response[index + N]
            };
        }
        this.result._frequencies_ = response[2 * N];
        this.result._network_ = this;   // for later reference
        return this.result;
    };


    // Helper for adding devices to a circuit, warns on duplicate device names.
    Circuit.prototype.add_device = function(d, name) {
        // Add device to list of devices and to device map
        this.devices.push(d);
        d.name = name;
        if (name) this.device_map[name] = d;
        return d;
    };

    Circuit.prototype.r = function(n1, n2, v, name) {
        if (v !== 0) {
            var d = new Resistor(n1, n2, v);
            return this.add_device(d, name);
        }
        else return this.v(n1, n2, '0', name); // zero resistance == 0V voltage source
    };

    Circuit.prototype.d = function(n1, n2, area, type, name) {
        if (area !== 0) {
            var d = new Diode(n1, n2, area, type);
            return this.add_device(d, name);
        } // zero area diodes discarded.
        return undefined;
    };


    Circuit.prototype.c = function(n1, n2, v, name) {
        var d = new Capacitor(n1, n2, v);
        return this.add_device(d, name);
    };

    Circuit.prototype.l = function(n1, n2, v, name) {
        var branch = this.node(undefined, T_CURRENT);
        var d = new Inductor(n1, n2, branch, v);
        return this.add_device(d, name);
    };

    Circuit.prototype.v = function(n1, n2, v, name) {
        var branch = this.node(undefined, T_CURRENT);
        var d = new VSource(n1, n2, branch, v);
        this.voltage_sources.push(d);
        return this.add_device(d, name);
    };

    Circuit.prototype.i = function(n1, n2, v, name) {
        var d = new ISource(n1, n2, v);
        this.current_sources.push(d);
        return this.add_device(d, name);
    };

    Circuit.prototype.opamp = function(np, nn, no, ng, A, name) {
        var branch = this.node(undefined, T_CURRENT);
        var d = new Opamp(np, nn, no, ng, branch, A, name);
        return this.add_device(d, name);
    };

    Circuit.prototype.n = function(d, g, s, W, L, name) {
        var f = new Fet(d, g, s, W, L, name, 'n');
        return this.add_device(f, name);
    };

    Circuit.prototype.p = function(d, g, s, W, L, name) {
        var f = new Fet(d, g, s, W, L, name, 'p');
        return this.add_device(f, name);
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Support for creating conductance and capacitance matrices associated with
    //  modified nodal analysis (unknowns are node voltages and inductor and voltage
    //  source currents). 
    //  The linearized circuit is written as 
    //          C d/dt x = G x + rhs
    //  x - vector of node voltages and element currents
    //  rhs - vector of source values
    //  C - Matrix whose values are capacitances and inductances, has many zero rows.
    //  G - Matrix whose values are conductances and +-1's.
    //
    ////////////////////////////////////////////////////////////////////////////////

    // add val component between two nodes to matrix M
    // Index of -1 refers to ground node
    Circuit.prototype.add_two_terminal = function(i, j, g, M) {
        if (i >= 0) {
            M[i][i] += g;
            if (j >= 0) {
                M[i][j] -= g;
                M[j][i] -= g;
                M[j][j] += g;
            }
        }
        else if (j >= 0) M[j][j] += g;
    };

    // add val component between two nodes to matrix M
    // Index of -1 refers to ground node
    Circuit.prototype.get_two_terminal = function(i, j, x) {
        var xi_minus_xj = 0;
        if (i >= 0) xi_minus_xj = x[i];
        if (j >= 0) xi_minus_xj -= x[j];
        return xi_minus_xj;
    };

    Circuit.prototype.add_conductance_l = function(i, j, g) {
        this.add_two_terminal(i, j, g, this.Gl);
    };

    Circuit.prototype.add_conductance = function(i, j, g) {
        this.add_two_terminal(i, j, g, this.G);
    };

    Circuit.prototype.add_capacitance = function(i, j, c) {
        this.add_two_terminal(i, j, c, this.C);
    };

    // add individual conductance to Gl matrix
    Circuit.prototype.add_to_Gl = function(i, j, g) {
        if (i >= 0 && j >= 0) this.Gl[i][j] += g;
    };

    // add individual conductance to Gl matrix
    Circuit.prototype.add_to_G = function(i, j, g) {
        if (i >= 0 && j >= 0) this.G[i][j] += g;
    };

    // add individual capacitance to C matrix
    Circuit.prototype.add_to_C = function(i, j, c) {
        if (i >= 0 && j >= 0) this.C[i][j] += c;
    };

    // add source info to rhs
    Circuit.prototype.add_to_rhs = function(i, v, rhs) {
        if (i >= 0) rhs[i] += v;
    };


    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Generic matrix support - making, copying, factoring, rank, etc
    //  Note, Matrices are stored using nested javascript arrays.
    ////////////////////////////////////////////////////////////////////////////////

    // Allocate an NxM matrix
    function mat_make(N, M) {
        var mat = new Array(N);
        for (var i = N - 1; i >= 0; i -= 1) {
            mat[i] = new Array(M);
            for (var j = M - 1; j >= 0; j -= 1) {
                mat[i][j] = 0.0;
            }
        }
        return mat;
    }

    // Form b = scale*Mx
    function mat_v_mult(M, x, b, scale) {
        var n = M.length;
        var m = M[0].length;

        if (n != b.length || m != x.length) throw 'Rows of M mismatched to b or cols mismatch to x.';

        for (var i = 0; i < n; i += 1) {
            var temp = 0;
            for (var j = 0; j < m; j += 1) {
                temp += M[i][j] * x[j];
            }
            b[i] = scale * temp; // Recall the neg in the name
        }
    }

    // C = scalea*A + scaleb*B, scalea, scaleb eithers numbers or arrays (row scaling)
    function mat_scale_add(A, B, scalea, scaleb, C) {
        var i, j;
        var n = A.length;
        var m = A[0].length;

        if (n > B.length || m > B[0].length) throw 'Row or columns of A to large for B';
        if (n > C.length || m > C[0].length) throw 'Row or columns of A to large for C';
        if ((typeof scalea == 'number') && (typeof scaleb == 'number')) for (i = 0; i < n; i += 1) {
            for (j = 0; j < m; j += 1) {
                C[i][j] = scalea * A[i][j] + scaleb * B[i][j];
            }
        }
        else if ((typeof scaleb == 'number') && (scalea instanceof Array)) for (i = 0; i < n; i += 1) {
            for (j = 0; j < m; j += 1) {
                C[i][j] = scalea[i] * A[i][j] + scaleb * B[i][j];
            }
        }
        else if ((typeof scaleb instanceof Array) && (scalea instanceof Array)) for (i = 0; i < n; i += 1) {
            for (j = 0; j < m; j += 1) {
                C[i][j] = scalea[i] * A[i][j] + scaleb[i] * B[i][j];
            }
        }
        else throw 'scalea and scaleb must be scalars or Arrays';
    }

    // Returns a vector of ones and zeros, ones denote algebraic
    // variables (rows that can be removed without changing rank(M).
    Circuit.prototype.algebraic = function(M) {
        var Nr = M.length;
        var Mc = mat_make(Nr, Nr);
        mat_copy(M, Mc);
        var R = mat_rank(Mc);
        var col;

        var one_if_alg = new Array(Nr);
        for (var row = 0; row < Nr; row += 1) { // psuedo gnd row small
            for (col = Nr - 1; col >= 0; col -= 1) {
                Mc[row][col] = 0;
            }
            if (mat_rank(Mc) == R) // Zeroing row left rank unchanged
            one_if_alg[row] = 1;
            else { // Zeroing row changed rank, put back
                for (col = Nr - 1; col >= 0; col -= 1) {
                    Mc[row][col] = M[row][col];
                }
                one_if_alg[row] = 0;
            }
        }
        return one_if_alg;
    };

    // Copy A -> using the bounds of A
    function mat_copy(src, dest) {
        var n = src.length;
        var m = src[0].length;
        if (n > dest.length || m > dest[0].length) throw 'Rows or cols > rows or cols of dest';

        for (var i = 0; i < n; i += 1) {
            for (var j = 0; j < m; j += 1) {
                dest[i][j] = src[i][j];
            }
        }
    }

    // Copy and transpose A -> using the bounds of A
    function mat_copy_transposed(src, dest) {
        var n = src.length;
        var m = src[0].length;
        if (n > dest[0].length || m > dest.length) throw 'Rows or cols > cols or rows of dest';

        for (var i = 0; i < n; i += 1) {
            for (var j = 0; j < m; j += 1) {
                dest[j][i] = src[i][j];
            }
        }
    }


    // Uses GE to determine rank.
    function mat_rank(Mo) {
        var Nr = Mo.length; // Number of rows
        var Nc = Mo[0].length; // Number of columns
        var temp, i, j, row, col;
        // Make a copy to avoid overwriting
        var M = mat_make(Nr, Nc);
        mat_copy(Mo, M);

        // Find matrix maximum entry
        var max_abs_entry = 0;
        for (row = Nr - 1; row >= 0; row -= 1) {
            for (col = Nr - 1; col >= 0; col -= 1) {
                if (Math.abs(M[row][col]) > max_abs_entry) max_abs_entry = Math.abs(M[row][col]);
            }
        }

        // Gaussian elimination to find rank
        var the_rank = 0;
        var start_col = 0;
        for (row = 0; row < Nr; row += 1) {
            // Search for first nonzero column in the remaining rows.
            for (col = start_col; col < Nc; col += 1) {
                var max_v = Math.abs(M[row][col]);
                var max_row = row;
                for (i = row + 1; i < Nr; i += 1) {
                    temp = Math.abs(M[i][col]);
                    if (temp > max_v) {
                        max_v = temp;
                        max_row = i;
                    }
                }
                // if max_v non_zero, column is nonzero, eliminate in subsequent rows
                if (Math.abs(max_v) > eps * max_abs_entry) {
                    start_col = col + 1;
                    the_rank += 1;
                    // Swap rows to get max in M[row][col]
                    temp = M[row];
                    M[row] = M[max_row];
                    M[max_row] = temp;

                    // now eliminate this column for all subsequent rows
                    for (i = row + 1; i < Nr; i += 1) {
                        temp = M[i][col] / M[row][col]; // multiplier for current row
                        if (temp !== 0) // subtract 
                        for (j = col; j < Nc; j += 1) {
                            M[i][j] -= M[row][j] * temp;
                        }
                    }
                    // Now move on to the next row
                    break;
                }
            }
        }

        // return the rank
        return the_rank;
    }

    // Solve Mx=b and return vector x using R^TQ^T factorization. 
    // Multiplication by R^T implicit, should be null-space free soln.
    // M should have the extra column!
    // Almost everything is in-lined for speed, sigh.
    function mat_solve_rq(M, rhs) {
        var row, rowp, col, Mr;
        var Nr = M.length; // Number of rows
        var Nc = M[0].length; // Number of columns

        // Copy the rhs in to the last column of M if one is given.
        if (rhs !== null) {
            for (row = Nr - 1; row >= 0; row -= 1) {
                M[row][Nc - 1] = rhs[row];
            }
        }

        var mat_scale = 0; // Sets the scale for comparison to zero.
        var max_nonzero_row = Nr - 1; // Assumes M nonsingular.
        for (row = 0; row < Nr; row += 1) {
            // Find largest row with largest 2-norm
            var max_row = row;
            var maxsumsq = 0;
            for (rowp = row; rowp < Nr; rowp += 1) {
                Mr = M[rowp];
                var sumsq = 0;
                for (col = Nc - 2; col >= 0; col -= 1) { // Last col=rhs
                    sumsq += Mr[col] * Mr[col];
                }
                if ((row == rowp) || (sumsq > maxsumsq)) {
                    max_row = rowp;
                    maxsumsq = sumsq;
                }
            }
            if (max_row > row) { // Swap rows if not max row
                var temp = M[row];
                M[row] = M[max_row];
                M[max_row] = temp;
            }

            // Calculate row norm, save if this is first (largest)
            var row_norm = Math.sqrt(maxsumsq);
            if (row === 0) mat_scale = row_norm;

            // Check for all zero rows
            var scale;
            if (row_norm > mat_scale * eps) scale = 1.0 / row_norm;
            else {
                max_nonzero_row = row - 1; // Rest will be nullspace of M
                break;
            }


            // Nonzero row, eliminate from rows below
            Mr = M[row];
            for (col = Nc - 1; col >= 0; col -= 1) { // Scale rhs also
                Mr[col] *= scale;
            }
            for (rowp = row + 1; rowp < Nr; rowp += 1) { // Update.
                var Mrp = M[rowp];
                var inner = 0;
                for (col = Nc - 2; col >= 0; col -= 1) { // Project 
                    inner += Mr[col] * Mrp[col];
                }
                for (col = Nc - 1; col >= 0; col -= 1) { // Ortho (rhs also)
                    Mrp[col] -= inner * Mr[col];
                }
            }
        }

        // Last Column of M has inv(R^T)*rhs.  Scale rows of Q to get x.
        var x = new Array(Nc - 1);
        for (col = Nc - 2; col >= 0; col -= 1) {
            x[col] = 0;
        }
        for (row = max_nonzero_row; row >= 0; row -= 1) {
            Mr = M[row];
            for (col = Nc - 2; col >= 0; col -= 1) {
                x[col] += Mr[col] * Mr[Nc - 1];
            }
        }

        // Return solution.
        return x;
    }

    // solve Mx=b and return vector x given augmented matrix M = [A | b]
    // Uses Gaussian elimination with partial pivoting
    function mat_solve(M, rhs) {
        var N = M.length; // augmented matrix M has N rows, N+1 columns
        var temp, i, j;

        // Copy the rhs in to the last column of M if one is given.
        if (rhs !== null) {
            for (var row = 0; row < N; row += 1) {
                M[row][N] = rhs[row];
            }
        }

        // gaussian elimination
        for (var col = 0; col < N; col += 1) {
            // find pivot: largest abs(v) in this column of remaining rows
            var max_v = Math.abs(M[col][col]);
            var max_col = col;
            for (i = col + 1; i < N; i += 1) {
                temp = Math.abs(M[i][col]);
                if (temp > max_v) {
                    max_v = temp;
                    max_col = i;
                }
            }

            // if no value found, generate a small conductance to gnd
            // otherwise swap current row with pivot row
            if (max_v === 0) M[col][col] = eps;
            else {
                temp = M[col];
                M[col] = M[max_col];
                M[max_col] = temp;
            }

            // now eliminate this column for all subsequent rows
            for (i = col + 1; i < N; i += 1) {
                temp = M[i][col] / M[col][col]; // multiplier we'll use for current row
                if (temp !== 0)
                // subtract current row from row we're working on
                // remember to process b too!
                for (j = col; j <= N; j += 1) {
                    M[i][j] -= M[col][j] * temp;
                }
            }
        }

        // matrix is now upper triangular, so solve for elements of x starting
        // with the last row
        var x = new Array(N);
        for (i = N - 1; i >= 0; i -= 1) {
            temp = M[i][N]; // grab b[i] from augmented matrix as RHS
            // subtract LHS term from RHS using known x values
            for (j = N - 1; j > i; j -= 1) temp -= M[i][j] * x[j];
            // now compute new x value
            x[i] = temp / M[i][i];
        }

        // return solution
        return x;
    }

    // test solution code, expect x = [2,3,-1]
    //M = [[2,1,-1,8],[-3,-1,2,-11],[-2,1,2,-3]];
    //x = mat_solve(M);
    //y = 1;  // so we have place to set a breakpoint :)

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Device base class
    //
    ////////////////////////////////////////////////////////////////////////////////

    function Device() {}

    // complete initial set up of device
    Device.prototype.finalize = function() {};

    // Load the linear elements in to Gl and C
    Device.prototype.load_linear = function(ckt) {};

    // load linear system equations for dc analysis
    // (inductors shorted and capacitors opened)
    Device.prototype.load_dc = function(ckt, soln, rhs) {};

    // load linear system equations for tran analysis
    Device.prototype.load_tran = function(ckt, soln) {};

    // load linear system equations for ac analysis:
    // current sources open, voltage sources shorted
    // linear models at operating point for everyone else
    Device.prototype.load_ac = function(ckt, rhs) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Sources
    //
    ///////////////////////////////////////////////////////////////////////////////

    function VSource(npos, nneg, branch, v) {
        Device.call(this);

        this.src = jade.utils.parse_source(v);
        this.npos = npos;
        this.nneg = nneg;
        this.branch = branch;
    }
    VSource.prototype = new Device();
    VSource.prototype.constructor = VSource;

    // load linear part for source evaluation
    VSource.prototype.load_linear = function(ckt) {
        // MNA stamp for independent voltage source
        ckt.add_to_Gl(this.branch, this.npos, 1.0);
        ckt.add_to_Gl(this.branch, this.nneg, - 1.0);
        ckt.add_to_Gl(this.npos, this.branch, 1.0);
        ckt.add_to_Gl(this.nneg, this.branch, - 1.0);
    };

    // Source voltage added to b.
    VSource.prototype.load_dc = function(ckt, soln, rhs) {
        ckt.add_to_rhs(this.branch, this.src.dc, rhs);
    };

    // Load time-dependent value for voltage source for tran
    VSource.prototype.load_tran = function(ckt, soln, rhs, time) {
        ckt.add_to_rhs(this.branch, this.src.value(time), rhs);
    };

    // small signal model ac value
    VSource.prototype.load_ac = function(ckt, rhs) {
        ckt.add_to_rhs(this.branch, 1.0, rhs);
    };

    function ISource(npos, nneg, v) {
        Device.call(this);

        this.src = jade.utils.parse_source(v);
        this.npos = npos;
        this.nneg = nneg;
    }
    ISource.prototype = new Device();
    ISource.prototype.constructor = ISource;

    ISource.prototype.load_linear = function(ckt) {
        // Current source is open when off, no linear contribution
    };

    // load linear system equations for dc analysis
    ISource.prototype.load_dc = function(ckt, soln, rhs) {
        var is = this.src.dc;

        // MNA stamp for independent current source
        ckt.add_to_rhs(this.npos, - is, rhs); // current flow into npos
        ckt.add_to_rhs(this.nneg, is, rhs); // and out of nneg
    };

    // load linear system equations for tran analysis (just like DC)
    ISource.prototype.load_tran = function(ckt, soln, rhs, time) {
        var is = this.src.value(time);

        // MNA stamp for independent current source
        ckt.add_to_rhs(this.npos, - is, rhs); // current flow into npos
        ckt.add_to_rhs(this.nneg, is, rhs); // and out of nneg
    };

    // small signal model: open circuit
    ISource.prototype.load_ac = function(ckt, rhs) {
        // MNA stamp for independent current source
        ckt.add_to_rhs(this.npos, - 1.0, rhs); // current flow into npos
        ckt.add_to_rhs(this.nneg, 1.0, rhs); // and out of nneg
    };

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Resistor
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Resistor(n1, n2, v) {
        Device.call(this);
        this.n1 = n1;
        this.n2 = n2;
        this.g = 1.0 / v;
    }
    Resistor.prototype = new Device();
    Resistor.prototype.constructor = Resistor;

    Resistor.prototype.load_linear = function(ckt) {
        // MNA stamp for admittance g
        ckt.add_conductance_l(this.n1, this.n2, this.g);
    };

    Resistor.prototype.load_dc = function(ckt) {
        // Nothing to see here, move along.
    };

    Resistor.prototype.load_tran = function(ckt, soln) {};

    Resistor.prototype.load_ac = function(ckt) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Diode
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Diode(n1, n2, v, type) {
        Device.call(this);
        this.anode = n1;
        this.cathode = n2;
        this.area = v;
        this.type = type; // 'normal' or 'ideal'
        this.is = 1.0e-14;
        this.ais = this.area * this.is;
        this.vt = (type == 'normal') ? 25.8e-3 : 0.1e-3; // 26mv or .1mv
        this.exp_arg_max = 50; // less than single precision max.
        this.exp_max = Math.exp(this.exp_arg_max);
    }
    Diode.prototype = new Device();
    Diode.prototype.constructor = Diode;

    Diode.prototype.load_linear = function(ckt) {
        // Diode is not linear, has no linear piece.
    };

    Diode.prototype.load_dc = function(ckt, soln, rhs) {
        var vd = ckt.get_two_terminal(this.anode, this.cathode, soln);
        var exp_arg = vd / this.vt;
        var temp1, temp2;
        // Estimate exponential with a quadratic if arg too big.
        var abs_exp_arg = Math.abs(exp_arg);
        var d_arg = abs_exp_arg - this.exp_arg_max;
        if (d_arg > 0) {
            var quad = 1 + d_arg + 0.5 * d_arg * d_arg;
            temp1 = this.exp_max * quad;
            temp2 = this.exp_max * (1 + d_arg);
        }
        else {
            temp1 = Math.exp(abs_exp_arg);
            temp2 = temp1;
        }
        if (exp_arg < 0) { // Use exp(-x) = 1.0/exp(x)
            temp1 = 1.0 / temp1;
            temp2 = (temp1 * temp2) * temp1;
        }
        var id = this.ais * (temp1 - 1);
        var gd = this.ais * (temp2 / this.vt);

        // MNA stamp for independent current source
        ckt.add_to_rhs(this.anode, - id, rhs); // current flows into anode
        ckt.add_to_rhs(this.cathode, id, rhs); // and out of cathode
        ckt.add_conductance(this.anode, this.cathode, gd);
    };

    Diode.prototype.load_tran = function(ckt, soln, rhs, time) {
        this.load_dc(ckt, soln, rhs);
    };

    Diode.prototype.load_ac = function(ckt) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Capacitor
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Capacitor(n1, n2, v) {
        Device.call(this);
        this.n1 = n1;
        this.n2 = n2;
        this.value = v;
    }
    Capacitor.prototype = new Device();
    Capacitor.prototype.constructor = Capacitor;

    Capacitor.prototype.load_linear = function(ckt) {
        // MNA stamp for capacitance matrix 
        ckt.add_capacitance(this.n1, this.n2, this.value);
    };

    Capacitor.prototype.load_dc = function(ckt, soln, rhs) {};

    Capacitor.prototype.load_ac = function(ckt) {};

    Capacitor.prototype.load_tran = function(ckt) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Inductor
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Inductor(n1, n2, branch, v) {
        Device.call(this);
        this.n1 = n1;
        this.n2 = n2;
        this.branch = branch;
        this.value = v;
    }
    Inductor.prototype = new Device();
    Inductor.prototype.constructor = Inductor;

    Inductor.prototype.load_linear = function(ckt) {
        // MNA stamp for inductor linear part
        // L on diag of C because L di/dt = v(n1) - v(n2)
        ckt.add_to_Gl(this.n1, this.branch, 1);
        ckt.add_to_Gl(this.n2, this.branch, - 1);
        ckt.add_to_Gl(this.branch, this.n1, - 1);
        ckt.add_to_Gl(this.branch, this.n2, 1);
        ckt.add_to_C(this.branch, this.branch, this.value);
    };

    Inductor.prototype.load_dc = function(ckt, soln, rhs) {
        // Inductor is a short at dc, so is linear.
    };

    Inductor.prototype.load_ac = function(ckt) {};

    Inductor.prototype.load_tran = function(ckt) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Simple Voltage-Controlled Voltage Source Op Amp model 
    //
    ///////////////////////////////////////////////////////////////////////////////

    function Opamp(np, nn, no, ng, branch, A, name) {
        Device.call(this);
        this.np = np;
        this.nn = nn;
        this.no = no;
        this.ng = ng;
        this.branch = branch;
        this.gain = A;
        this.name = name;
    }

    Opamp.prototype = new Device();
    Opamp.prototype.constructor = Opamp;

    Opamp.prototype.load_linear = function(ckt) {
        // MNA stamp for VCVS: 1/A(v(no) - v(ng)) - (v(np)-v(nn))) = 0.
        var invA = 1.0 / this.gain;
        ckt.add_to_Gl(this.no, this.branch, 1);
        ckt.add_to_Gl(this.ng, this.branch, - 1);
        ckt.add_to_Gl(this.branch, this.no, invA);
        ckt.add_to_Gl(this.branch, this.ng, - invA);
        ckt.add_to_Gl(this.branch, this.np, - 1);
        ckt.add_to_Gl(this.branch, this.nn, 1);
    };

    Opamp.prototype.load_dc = function(ckt, soln, rhs) {
        // Op-amp is linear.
    };

    Opamp.prototype.load_ac = function(ckt) {};

    Opamp.prototype.load_tran = function(ckt) {};

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Simplified MOS FET with no bulk connection and no body effect.
    //
    ///////////////////////////////////////////////////////////////////////////////

    // approx. SPICE params for MOSIS 0.25u TSMC process
    //  scale factor = 0.25u
    //  nfet: vth = 0.5V, K' = 120 uA/V**2
    //  pfet: vth = -0.5V, K' = -25 uA/V**2
    //  diffusions: area cap = 2000 aF/um**2, perimeter cap = 500 aF/um
    //  gate cap = 6000 aF/um**2

    function Fet(d, g, s, W, L, name, type) {
        if (type != 'n' && type != 'p') throw name + ' fet type is not n or p';

        Device.call(this);
        this.d = d;
        this.g = g;
        this.s = s;
        this.name = name;
        this.W = W;
        this.L = L;
        this.ratio = W / L;
        this.type_sign = (type == 'n') ? 1 : -1;
        this.vt = 0.5;
        this.kp = (type == 'n') ? 120e-6 : 25e-6;
        this.beta = this.kp * this.ratio;
        this.lambda = 0.05;
        this.g_leak = 1.0e-8 * this.beta;
    }
    Fet.prototype = new Device();
    Fet.prototype.constructor = Fet;

    Fet.prototype.load_linear = function(ckt) {
        // a small leakage current -- helps with correct DC analysis
        ckt.add_conductance_l(this.d, this.s, this.g_leak);

        // in the absence of a bulk terminal, use the ground node

        // diffusion capacitances.  No sidewall cap on channel-side.
        var W = this.W * 0.25;
        var L = 4 * 0.25; // assume diffusions are 4 lambda wide.
        ckt.add_capacitance(this.d, ckt.gnd_node(), (2000e-18) * W * L + (500e-18) * (W + 2 * L));
        ckt.add_capacitance(this.s, ckt.gnd_node(), (2000e-18) * W * L + (500e-18) * (W + 2 * L));

        // gate capacitance
        L = this.L * 0.25;
        ckt.add_capacitance(this.g, ckt.gnd_node(), (6000e-18) * W * L);
    };

    Fet.prototype.load_dc = function(ckt, soln, rhs) {
        var vds = this.type_sign * ckt.get_two_terminal(this.d, this.s, soln);
        if (vds < 0) { // Drain and source have swapped roles
            var temp = this.d;
            this.d = this.s;
            this.s = temp;
            vds = this.type_sign * ckt.get_two_terminal(this.d, this.s, soln);
        }
        var vgs = this.type_sign * ckt.get_two_terminal(this.g, this.s, soln);
        var vgst = vgs - this.vt;
        var gmgs, ids, gds;
        if (vgst > 0.0) { // vgst < 0, transistor off, no subthreshold here.
            if (vgst < vds) { /* Saturation. */
                gmgs = this.beta * (1 + (this.lambda * vds)) * vgst;
                ids = this.type_sign * 0.5 * gmgs * vgst;
                gds = 0.5 * this.beta * vgst * vgst * this.lambda;
            }
            else { /* Linear region */
                gmgs = this.beta * (1 + this.lambda * vds);
                ids = this.type_sign * gmgs * vds * (vgst - 0.50 * vds);
                gds = gmgs * (vgst - vds) + this.beta * this.lambda * vds * (vgst - 0.5 * vds);
                gmgs *= vds;
            }
            ckt.add_to_rhs(this.d, - ids, rhs); // current flows into the drain
            ckt.add_to_rhs(this.s, ids, rhs);   // and out the source
            ckt.add_conductance(this.d, this.s, gds);
            ckt.add_to_G(this.s, this.s, gmgs);
            ckt.add_to_G(this.d, this.s, - gmgs);
            ckt.add_to_G(this.d, this.g, gmgs);
            ckt.add_to_G(this.s, this.g, - gmgs);
        }
    };

    Fet.prototype.load_tran = function(ckt, soln, rhs) {
        this.load_dc(ckt, soln, rhs);
    };

    Fet.prototype.load_ac = function(ckt) {};

    /*
    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Source parsing
    //
    ///////////////////////////////////////////////////////////////////////////////

    // argument is an object with type and args attributes describing the source's value
    //    type: one of dc,step,square,triangle,sin,pulse,pwl,pwl_repeating
    //    args: list of numbers

    // returns an object with the following attributes:
    //   fun -- name of source function
    //   args -- list of argument values
    //   value(t) -- compute source value at time t
    //   inflection_point(t) -- compute time after t when a time point is needed
    //   period -- repeat period for periodic sources (0 if not periodic)

    function parse_source(v) {
        // generic parser: parse v as either <value> or <fun>(<value>,...)
        var src = {};
        src.fun = v.type;
        src.args = v.args;
        src.period = 0; // Default not periodic
        src.value = function(t) {
            return 0;
        }; // overridden below
        src.inflection_point = function(t) {
            return undefined;
        }; // may be overridden below

        var v1,v2,freq,per,td,tr,tf;

        // post-processing for constant sources
        // dc(v)
        if (src.fun == 'dc') {
            var val = arg_value(src.args, 0, 0);
            src.args = [val];
            src.value = function(t) {
                return val;
            }; // closure
        }

        // post-processing for impulse sources
        // impulse(height,width)
        else if (src.fun == 'impulse') {
            var h = arg_value(src.args, 0, 1); // default height: 1
            var w = Math.abs(arg_value(src.args, 2, 1e-9)); // default width: 1ns
            src.args = [h, w]; // remember any defaulted values
            pwl_source(src, [0, 0, w / 2, h, w, 0], false);
        }

        // post-processing for step sources
        // step(v_init,v_plateau,t_delay,t_rise)
        else if (src.fun == 'step') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            td = Math.max(0, arg_value(src.args, 2, 0)); // time step starts
            tr = Math.abs(arg_value(src.args, 3, 1e-9)); // default rise time: 1ns
            src.args = [v1, v2, td, tr]; // remember any defaulted values
            pwl_source(src, [td, v1, td + tr, v2], false);
        }

        // post-processing for square wave
        // square(v_init,v_plateau,freq,duty_cycle)
        else if (src.fun == 'square') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1Hz
            var duty_cycle = Math.min(100, Math.abs(arg_value(src.args, 3, 50))); // default duty cycle: 0.5
            src.args = [v1, v2, freq, duty_cycle]; // remember any defaulted values

            per = freq === 0 ? Infinity : 1 / freq;
            var t_change = 0.01 * per; // rise and fall time
            var t_pw = 0.01 * duty_cycle * 0.98 * per; // fraction of cycle minus rise and fall time
            pwl_source(src, [0, v1, t_change, v2, t_change + t_pw,
                             v2, t_change + t_pw + t_change, v1, per, v1], true);
        }

        // post-processing for triangle
        // triangle(v_init,v_plateau,freq)
        else if (src.fun == 'triangle') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1s
            src.args = [v1, v2, freq]; // remember any defaulted values

            per = freq === 0 ? Infinity : 1 / freq;
            pwl_source(src, [0, v1, per / 2, v2, per, v1], true);
        }

        // post-processing for pwl and pwlr sources
        // pwl[r](t1,v1,t2,v2,...)
        else if (src.fun == 'pwl' || src.fun == 'pwl_repeating') {
            pwl_source(src, src.args, src.fun == 'pwl_repeating');
        }

        // post-processing for pulsed sources
        // pulse(v_init,v_plateau,t_delay,t_width,t_rise,t_fall,t_period)
        else if (src.fun == 'pulse') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            td = Math.max(0, arg_value(src.args, 2, 0)); // time pulse starts
            var pw = Math.abs(arg_value(src.args, 3, 1e9)); // default pulse width: "infinite"
            tr = Math.abs(arg_value(src.args, 4, 0.1e-9)); // default rise time: .1ns
            tf = Math.abs(arg_value(src.args, 5, 0.1e-9)); // default rise time: .1ns
            per = Math.abs(arg_value(src.args, 6, 1e9)); // default period: "infinite"
            src.args = [v1, v2, td, tr, tf, pw, per];

            var t1 = td; // time when v1 -> v2 transition starts
            var t2 = t1 + tr; // time when v1 -> v2 transition ends
            var t3 = t2 + pw; // time when v2 -> v1 transition starts
            var t4 = t3 + tf; // time when v2 -> v1 transition ends

            pwl_source(src, [t1, v1, t2, v2, t3, v2, t4, v1, per, v1], true);
        }

        // post-processing for sinusoidal sources
        // sin(freq_hz,v_offset,v_amplitude,t_delay,phase_offset_degrees)
        else if (src.fun == 'sin') {
            freq = Math.abs(arg_value(src.args, 0, 1)); // default frequency: 1Hz
            src.period = 1.0 / freq;
            var voffset = arg_value(src.args, 1, 0); // default offset voltage: 0V
            var va = arg_value(src.args, 2, 1); // default amplitude: -1V to 1V
            td = Math.max(0, arg_value(src.args, 3, 0)); // default time delay: 0sec
            var phase = arg_value(src.args, 4, 0); // default phase offset: 0 degrees
            src.args = [voffset, va, freq, td, phase];

            phase /= 360.0;

            // return value of source at time t
            src.value = function(t) { // closure
                if (t < td) return voffset + va * Math.sin(2 * Math.PI * phase);
                else return voffset + va * Math.sin(2 * Math.PI * (freq * (t - td) + phase));
            };

            // return time of next inflection point after time t
            src.inflection_point = function(t) { // closure
                if (t < td) return td;
                else return undefined;
            };
        }

        // object has all the necessary info to compute the source value and inflection points
        src.dc = src.value(0); // DC value is value at time 0
        return src;
    }

    function pwl_source(src, tv_pairs, repeat) {
        var nvals = tv_pairs.length;
        src.tvpairs = tv_pairs;
        if (repeat) src.period = tv_pairs[nvals - 2]; // Repeat period of source
        if (nvals % 2 == 1) nvals -= 1; // make sure it's even!

        if (nvals <= 2) {
            // handle degenerate case
            src.value = function(t) {
                return nvals == 2 ? tv_pairs[1] : 0;
            };
            src.inflection_point = function(t) {
                return undefined;
            };
        }
        else {
            src.value = function(t) { // closure
                if (repeat)
                // make time periodic if values are to be repeated
                t = Math.fmod(t, tv_pairs[nvals - 2]);
                var last_t = tv_pairs[0];
                var last_v = tv_pairs[1];
                if (t > last_t) {
                    var next_t, next_v;
                    for (var i = 2; i < nvals; i += 2) {
                        next_t = tv_pairs[i];
                        next_v = tv_pairs[i + 1];
                        if (next_t > last_t) // defend against bogus tv pairs
                        if (t < next_t) return last_v + (next_v - last_v) * (t - last_t) / (next_t - last_t);
                        last_t = next_t;
                        last_v = next_v;
                    }
                }
                return last_v;
            };
            src.inflection_point = function(t) { // closure
                if (repeat)
                // make time periodic if values are to be repeated
                t = Math.fmod(t, tv_pairs[nvals - 2]);
                for (var i = 0; i < nvals; i += 2) {
                    var next_t = tv_pairs[i];
                    if (t < next_t) return next_t;
                }
                return undefined;
            };
        }
    }

    // helper function: return args[index] if present, else default_v
    function arg_value(args, index, default_v) {
        var result = args[index];
        if (result === undefined) result = default_v;
        return result;
    }

    // we need fmod in the Math library!
    Math.fmod = function(numerator, denominator) {
        var quotient = Math.floor(numerator / denominator);
        return numerator - quotient * denominator;
    };

     */

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Module definition
    //
    ///////////////////////////////////////////////////////////////////////////////
    var module = {
        Circuit: Circuit,
        dc_analysis: dc_analysis,
        ac_analysis: ac_analysis,
        transient_analysis: transient_analysis,
        print_netlist: print_netlist
    };
    return module;
};


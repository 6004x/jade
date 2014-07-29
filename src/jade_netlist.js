//////////////////////////////////////////////////////////////////////
//
// Aspect -- netlisting extensions
//
//////////////////////////////////////////////////////////////////////

// mlist is a list of module names "lib:module" that are the leaves
// of the extraction tree.
// port_map is an associative array: local_sig => external_sig
// mstack is an array of parent module names so we can detect recursion
jade.model.Aspect.prototype.netlist = function(mlist, prefix, port_map,mstack) {
    var n = this.module.get_name();
    if (mstack.indexOf(n) != -1) {
        // oops, recursive use of module.  complain!
        mstack.push(n);  // just to make the message easy to construct
        throw 'Recursive inclusion of module:\n'+mstack.join(' \u2192 ');
    }
    mstack.push(n);  // remember that we're extracting this module

    // figure out signal names for all connections
    this.label_connection_points(prefix, port_map);

    // ensure unique names for each component
    this.ensure_component_names(prefix);

    // extract netlist from each component
    var netlist = [];
    for (var i = 0; i < this.components.length; i += 1) {
        var n = this.components[i].netlist(mlist, prefix, mstack);
        if (n !== undefined) netlist.push.apply(netlist, n);
    }

    mstack.pop();   // all done with extraction, remove module name
    return netlist;
};

// label all the nodes in the circuit
jade.model.Aspect.prototype.label_connection_points = function(prefix, port_map) {
    var i;
    
    // start by clearing all the connection point labels
    for (i = this.components.length - 1; i >= 0; i -= 1) {
        this.components[i].clear_labels();
    }

    // components are in charge of labeling their unlabeled connections.
    // labels given to connection points will propagate to coincident connection
    // points and across Wires.

    // let special components like GND or named wires label their connection(s)
    for (i = this.components.length - 1; i >= 0; i -= 1) {
        this.components[i].add_default_labels(prefix, port_map);
    }

    // now have components generate labels for unlabeled connections
    this.next_label = 0;
    for (i = this.components.length - 1; i >= 0; i -= 1) {
        this.components[i].label_connections(prefix);
    }
};

// generate a new label
jade.model.Aspect.prototype.get_next_label = function(prefix) {
    // generate next label in sequence
    this.next_label += 1;
    return prefix + this.next_label.toString();
};

// propagate label to coincident connection points
jade.model.Aspect.prototype.propagate_label = function(label, location) {
    var cplist = this.connection_points[location];
    for (var i = cplist.length - 1; i >= 0; i -= 1) {
        cplist[i].propagate_label(label);
    }
};

jade.model.Aspect.prototype.ensure_component_names = function(prefix) {
    var i, c, name;

    // first find out what names have been assigned
    var cnames = {}; // keep track of names at this level
    for (i = 0; i < this.components.length; i += 1) {
        c = this.components[i];
        name = c.name;
        if (name) {
            if (name in cnames) throw "Duplicate component name: " + prefix + name;
            cnames[name] = c; // add to our list
        }
    }

    // now create reasonable unique name for unnamed components that have name property
    for (i = 0; i < this.components.length; i += 1) {
        c = this.components[i];
        if (c.module.name === undefined) continue; // filter out built-in components
        name = c.name;
        if (name === '' || name === undefined) {
            var counter = 1;
            while (true) {
                name = c.module.name.toUpperCase() + '_' + counter.toString();
                if (!(name in cnames)) break;
                counter += 1;
            }
            c.name = name; // remember name assignment for next time
            cnames[name] = c; // add to our list
        }
    }
};

//////////////////////////////////////////////////////////////////////
//
// Component -- netlisting extensions
//
//////////////////////////////////////////////////////////////////////

// clear the labels on all connections
jade.model.Component.prototype.clear_labels = function() {
    for (var i = this.connections.length - 1; i >= 0; i -= 1) {
        this.connections[i].clear_label();
    }
};

// default action: don't propagate label
jade.model.Component.prototype.propagate_label = function(label) {};

// component should generate labels for all unlabeled connections
jade.model.Component.prototype.label_connections = function(prefix) {
    for (var i = this.connections.length - 1; i >= 0; i -= 1) {
        var cp = this.connections[i];
        if (!cp.label) {
            // generate label of appropriate length
            var len = cp.nlist.length;
            var label = [];
            for (var j = 0; j < len; j += 1) {
                label.push(this.aspect.get_next_label(prefix));
            }
            cp.propagate_label(label);
        }
    }
};

// give components a chance to generate a label for their connection(s).
// valid for any component with a "global_signal" or "signal" property
// (e.g., gnd, vdd, ports, wires).
jade.model.Component.prototype.add_default_labels = function(prefix, port_map) {
    var nlist, i;

    if (this.properties.global_signal)
        // no mapping or prefixing for global signals
        nlist = jade.utils.parse_signal(this.properties.global_signal);
    else {
        nlist = jade.utils.parse_signal(this.properties.signal);
        if (nlist.length > 0) {
            // substitute external names for local labels that are connected to ports
            // or add prefix to local labels
            for (i = 0; i < nlist.length; i += 1) {
                var n = nlist[i];
                if (n in port_map) nlist[i] = port_map[n];
                else nlist[i] = prefix + n;
            }
        }
    }

    // now actually propagate label to connections (we're expecting only
    // only one connection for all but wires which will have two).
    if (nlist.length > 0) for (i = 0; i < this.connections.length; i += 1) {
        this.connections[i].propagate_label(nlist);
    }
};

// netlist entry: ["type", {terminal:signal, ...}, {property: value, ...}]
jade.model.Component.prototype.netlist = function(mlist, prefix, mstack) {
    var i;
    
    // match up connections to the component's terminals, determine
    // the number of instances implied by the connections.
    var connections = [];
    var ninstances = 1; // always at least one instance
    for (i = 0; i < this.connections.length; i += 1) {
        var c = this.connections[i];
        var got = c.label.length;
        var expected = c.nlist.length;
        if ((got % expected) !== 0) {
            throw "Number of connections for terminal " + c.name + "of " + this.prefix + this.properties.name + " not a multiple of " + expected.toString();
        }

        // infer number of instances and remember the max we find.
        // we'll replicate connections if necessary during the
        // expansion phase.
        ninstances = Math.max(ninstances, got / expected);

        // remember for expansion phase
        connections.push([c.nlist, c.label]);
    }

    // ensure (ninstances mod W) is zero for all terminals (W = width of terminal)
    // ie, we'll cycle through each signal list an integral number of times
    for (i = 0; i < this.connections.length; i += 1) {
        var c = this.connections[i];
        var w = c.label.length;
        if ((ninstances % w) !== 0) {
            throw "Number of connections for terminal " + c.name + "of " + this.prefix + this.properties.name + " not a multiple of " + ninstances.toString();
        }
    }

    // now create the appropriate number of instances
    var netlist = [];
    for (i = 0; i < ninstances; i += 1) {
        // build port map
        var port_map = {};
        for (var j = 0; j < connections.length; j += 1) {
            var nlist = connections[j][0]; // list of terminal names
            var slist = connections[j][1]; // list of connected signals
            var sindex = i * nlist.length; // where to start in slist
            for (var k = 0; k < nlist.length; k += 1)
                // keep cycling through entries in slist as necessary
                port_map[nlist[k]] = slist[(sindex + k) % slist.length];
        }

        if (mlist.indexOf(this.type()) != -1) {
            // if leaf, create netlist entry
            var props = this.clone_properties(false);
            props.name = prefix + this.name;
            if (ninstances > 1) props.name += '[' + i.toString() + ']';
            netlist.push([this.type(), port_map, props]);
            continue;
        }

        if (this.has_aspect('schematic')) {
            var sch = this.module.aspect('schematic');
            // extract component's schematic, add to our netlist
            var p = prefix + this.name;
            if (ninstances > 1) p += '[' + i.toString() + ']';
            p += '.'; // hierarchical name separator
            var result = sch.netlist(mlist, p, port_map, mstack);
            netlist.push.apply(netlist, result);
        }
        else {
            // if no schematic, complain
            throw "No schematic for " + prefix + this.properties.name + " an instance of " + this.type();
        }

    }
    return netlist;
};

//////////////////////////////////////////////////////////////////////
//
// ConnectionPoint -- netlisting extensions
//
//////////////////////////////////////////////////////////////////////

jade.model.ConnectionPoint.prototype.propagate_label = function(label) {
    // should we check if existing label is the same?  it should be...

    if (this.label === undefined) {
        // label this connection point
        this.label = label;

        // propagate label to coincident connection points
        this.parent.aspect.propagate_label(label, this.location);

        // possibly label other cp's for this device?
        this.parent.propagate_label(label);
    }
    else if (!jade.utils.signal_equals(this.label, label))
        // signal an error while generating netlist
        throw "Node has two conflicting sets of labels: [" + this.label + "], [" + label + "]";
};

//////////////////////////////////////////////////////////////////////
//
// Netlist utilities
//
//////////////////////////////////////////////////////////////////////

jade.netlist = {};

// return a list of nodes appearing in a cktsim netlist
jade.netlist.extract_nodes= function(netlist) {
    var nodes = {};
    $.each(netlist,function(index,device){
        if (device.type != 'ground')
            for (var c in device.connections)
                nodes[device.connections[c]] = null;  // add to dictionary
        else
            nodes[device.connections[0]] = null;
    });

    return Object.keys(nodes);
};

jade.netlist.print_netlist = function(netlist) {
    if (netlist.length > 0) {
        var clist = [];
        $.each(netlist,function (item,device) {
            clist.push(device.type + " (" + device.properties.name + "): " + JSON.stringify(device.connections) + " " + JSON.stringify(device.properties));
        });
        console.log(clist.join('\n'));
        console.log(clist.length.toString() + ' devices');
    }
};

// parse foo(1,2,3) into {type: foo, args: [1,2,3]}
jade.netlistparse_source = function(value) {
    var m = value.match(/(\w+)\s*\((.*?)\)\s*/);
    var args = $.map(m[2].split(','),jade.utils.parse_number);
    return {type: m[1], args: args};
};


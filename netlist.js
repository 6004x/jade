// Copyright (C) 2011-2016 Massachusetts Institute of Technology
// Chris Terman

jade_defs.netlist = function(jade) {

    //////////////////////////////////////////////////////////////////////
    //
    // Aspect -- netlisting extensions
    //
    //////////////////////////////////////////////////////////////////////

    // mlist is a list of module names that are the leaves
    // of the extraction tree.
    // port_map is an associative array: local_sig => external_sig
    // mstack is an array of parent module names so we can detect recursion
    jade.model.Aspect.prototype.netlist = function(mlist, globals, prefix, port_map, mstack) {
        var n = this.module.get_name();
        if (mstack.indexOf(n) != -1) {
            // oops, recursive use of module.  complain!
            mstack.push(n);  // just to make the message easy to construct
            throw 'Recursive inclusion of module:\n'+mstack.join(' \u2192 ');
        }
        mstack.push(n);  // remember that we're extracting this module

        for (i = 0; i < this.components.length; i += 1) {
            // clear any selections so we can highlight errors;
            this.components[i].set_select(false);
            // just in case some icon terminal has changed its name
            this.components[i].compute_bbox();
        }

        // figure out signal names for all connections
        this.label_connection_points(globals, prefix, port_map);

        // ensure unique names for each component
        this.ensure_component_names(prefix);

        // extract netlist from each component
        var netlist = [];
        for (var i = 0; i < this.components.length; i += 1) {
            try {
                n = this.components[i].netlist(mlist, globals, prefix, mstack);
            } catch (e) {
                // catch errors as they go by and highlight offending component
                this.components[i].set_select(true);
                throw e;
            }
            if (n !== undefined) netlist.push.apply(netlist, n);
        }

        mstack.pop();   // all done with extraction, remove module name
        return netlist;
    };

    // label all the nodes in the circuit
    jade.model.Aspect.prototype.label_connection_points = function(globals, prefix, port_map) {
        var i;
        
        // start by clearing all the connection point labels and widths
        /*
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].clear_labels();
         }*/
        $.each(this.connection_points,function (locn,cplist) {
            $.each(cplist,function (index,cp) { cp.clear_label(); });
        });

        // propagate any specified widths through connected wires
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].propagate_width();
        }

        // components are in charge of labeling their unlabeled connections.
        // labels given to connection points will propagate to coincident connection
        // points and across Wires.

        // let special components like GND or named wires label their connection(s)
        for (i = this.components.length - 1; i >= 0; i -= 1) {
            this.components[i].add_default_labels(globals, prefix, port_map);
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

    jade.model.Aspect.prototype.propagate_select = function(cp) {
        var cplist = this.connection_points[cp.location];
        for (var i = cplist.length - 1; i >= 0; i -= 1) {
            cplist[i].propagate_select();
        }
    };

    // propagate label to coincident connection points
    jade.model.Aspect.prototype.propagate_label = function(label, location) {
        var cplist = this.connection_points[location];
        for (var i = cplist.length - 1; i >= 0; i -= 1) {
            cplist[i].propagate_label(label);
        }
    };

    // propagate width to coincident connection points
    jade.model.Aspect.prototype.propagate_width = function(width, location) {
        var cplist = this.connection_points[location];
        for (var i = cplist.length - 1; i >= 0; i -= 1) {
            cplist[i].propagate_width(width);
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
                if (name in cnames) {
                    c.selected = true;
                    throw "Duplicate component name: " + prefix + name;
                }
                cnames[name] = c; // add to our list
            }
        }

        // use a small cache to make generating many device names faster
        var cache = {};
        function gen_name(base) {
            var count = (cache[base] || 0) + 1;
            cache[base] = count;
            return base + '_' + count.toString();
        }

        // now create reasonable unique name for unnamed components that have name property
        for (i = 0; i < this.components.length; i += 1) {
            c = this.components[i];
            if (c.module.name === undefined) continue; // filter out built-in components
            name = c.name;
            if (name == '' || name === undefined) {
                var base = c.module.name.toLowerCase().split('/').pop();
                do { name = gen_name(base); } while (name in cnames);
                c.name = name; // remember name assignment for next time
                // c.set_property('name',name);   // add property to component
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
    /*
    jade.model.Component.prototype.clear_labels = function() {
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            this.connections[i].clear_label();
        }
    };
     */

    jade.model.Component.prototype.propagate_select = function () {};

    // default action: don't propagate label
    jade.model.Component.prototype.propagate_label = function(label) {};

    // default action: don't propagate width
    jade.model.Component.prototype.propagate_width = function(width) {};

    // component should generate labels for all unlabeled connections
    jade.model.Component.prototype.label_connections = function(prefix) {
        for (var i = this.connections.length - 1; i >= 0; i -= 1) {
            var cp = this.connections[i];
            if (!cp.label) {
                // generate label of appropriate length
                var len = cp.width || cp.nlist.length;
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
    jade.model.Component.prototype.add_default_labels = function(globals, prefix, port_map) {
        var nlist, i;

        if (this.properties.global_signal) {
            // no mapping or prefixing for global signals
            nlist = jade.utils.parse_signal(this.properties.global_signal);
            // let everyone else know this signal is global
            if (globals.indexOf(this.properties.global_signal) == -1)
                globals.push(this.properties.global_signal);
            // replicate if necessary
            if (this.connections[0].width > 1 && nlist.length == 1)
                while (this.connections[0].width > nlist.length) nlist.push(nlist[0]);
        } else {
            nlist = jade.utils.parse_signal(this.properties.signal);
            if (nlist.length > 0) {
                // substitute external names for local labels that are connected to ports
                // or add prefix to local labels
                for (i = 0; i < nlist.length; i += 1) {
                    var n = nlist[i];
                    if (n in port_map) nlist[i] = port_map[n];
                    else if (globals.indexOf(n) != -1) nlist[i] = n;
                    else nlist[i] = prefix + n;
                }
            }
        }

        // now actually propagate label to connections (we're expecting only
        // only one connection for all but wires which will have two).
        if (nlist.length > 0) {
            for (i = 0; i < this.connections.length; i += 1) {
                this.connections[i].propagate_label(nlist);
            }
        }
    };

    // netlist entry: ["type", {terminal:signal, ...}, {property: value, ...}]
    jade.model.Component.prototype.netlist = function(mlist, globals, prefix, mstack) {
        var i;
        var netlist = [];
        
        // jumpers get special treatment: the widths have to be the same
        // on both sides, no replication allowed since that tends to get
        // designers into trouble!
        if (this.type() == 'jumper') {
            var c1 = this.connections[0];
            var c2 = this.connections[1];
            var c1len = c1.label.length;
            var c2len = c2.label.length;
            if (c1len != c2len) {
                this.selected = true;
                throw "Signals of different widths ("+c1len.toString()+
                    "," + c2len.toString() + ") connected by jumper.";
            }
            for (i = 0; i < c1len; i += 1) {
                netlist.push(['jumper',{n1: c1.label[i], n2: c2.label[i]},{}]);
            }
            return netlist;
        }

        // match up connections to the component's terminals, determine
        // the number of instances implied by the connections.
        var connections = [];
        var ninstances = 1; // always at least one instance
        for (i = 0; i < this.connections.length; i += 1) {
            var c = this.connections[i];
            var got = c.label.length;
            var expected = c.nlist.length;
            if ((got % expected) !== 0) {
                this.selected = true;
                throw "Number of connections (" + got + ") for terminal " + c.name + " of " + prefix + this.name + " not a multiple of " + expected;
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
            var W = c.label.length;
            var consumed = ninstances * c.nlist.length;
            if (consumed % W !== 0) {
                this.selected = true;
                throw "Number of signals needed (" + consumed + ") for terminal " + c.name + " of " + prefix + this.name + " not multiple of " + W;
            }
        }

        // now create the appropriate number of instances
        for (i = 0; i < ninstances; i += 1) {
            // build port map
            var port_map = {};
            for (var j = 0; j < connections.length; j += 1) {
                var nlist = connections[j][0]; // list of terminal names
                var nlen = nlist.length;
                var slist = connections[j][1]; // list of connected signals
                var bsize = slist.length/nlen;  // number of signals provided for each terminal
                for (var k = 0; k < nlen; k += 1)
                    // keep cycling through entries in slist as necessary
                    port_map[nlist[k]] = slist[(i % bsize) + k*bsize];
            }

            if (mlist.indexOf(this.type()) != -1) {
                // if leaf, create netlist entry
                var props = this.clone_properties(false);
                if (this.name !== undefined) {
                    props.name = prefix + this.name.toLowerCase();
                    // start generated names with index at MSB
                    if (ninstances > 1) props.name += '[' + (ninstances - 1 - i).toString() + ']';
                }
                netlist.push([this.type(), port_map, props]);
            }
            else if (this.has_aspect('schematic')) {
                var sch = this.module.aspect('schematic');
                // extract component's schematic, add to our netlist
                if (this.name !== undefined) {
                    var p = prefix + this.name.toLowerCase();
                    if (ninstances > 1) p += '[' + (ninstances - 1 - i).toString() + ']';
                    p += '.'; // hierarchical name separator
                }
                var result = sch.netlist(mlist, globals, p, port_map, mstack);
                netlist.push.apply(netlist, result);
            }
            else {
                this.selected = true;
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

    jade.model.ConnectionPoint.prototype.clear_label = function() {
        this.label = undefined;
        this.width = undefined;
        this.selected = false;
    };

    jade.model.ConnectionPoint.prototype.propagate_select = function() {
        if (!this.selected) {
            this.selected = true;

            // propagate selection to coincident connection points
            this.parent.aspect.propagate_select(this);

            // see if our parent wants to select themselves
            this.parent.propagate_select();
        }
    };

    jade.model.ConnectionPoint.prototype.propagate_label = function(label) {
        if (this.width && this.width != label.length) {
            this.parent.aspect.propagate_select(this);
            throw "Node label ["+label+"] incompatible with specified width "+this.width.toString();
        }

        if (this.label === undefined) {
            // label this connection point
            this.label = label;

            // propagate label to coincident connection points
            this.parent.aspect.propagate_label(label, this.location);

            // possibly label other cp's for this device?
            this.parent.propagate_label(label);
        }
        else if (!jade.utils.signal_equals(this.label, label)) {
            // highlight offending nodes
            this.parent.aspect.propagate_select(this);

            // signal an error while generating netlist
            throw "Node has two conflicting sets of labels: [" + this.label.join(', ') + "], [" + label.join(', ') + "]";
        }
    };

    jade.model.ConnectionPoint.prototype.propagate_width = function(width) {
        if (this.width === undefined) {
            // label this connection point
            this.width = width;

            // propagate width to coincident connection points
            this.parent.aspect.propagate_width(width, this.location);

            // possibly label other cp's for this device?
            this.parent.propagate_width(width);
        }
        else if (this.width != width) {
            // highlight offending nodes
            this.parent.aspect.propagate_select(this);

            // signal an error while generating netlist
            throw "Node has two conflicting widths: " + this.width + ", " + width;
        }
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
                    nodes[device.connections[c].toLowerCase()] = null;  // add to dictionary
            else
                nodes[device.connections[0].toLowerCase()] = null;
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

};

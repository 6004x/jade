jade.utils = (function () {
    //////////////////////////////////////////////////////////////////////
    //
    // utilities
    //
    //////////////////////////////////////////////////////////////////////

    var valid_name = /^[A-Za-z_/][A-Za-z_/0-9]*$/;

    var numeric_constant = /^[\-+]?(0x[0-9a-fA-F]+|0b[01]+|0[0-7]+|[0-9]+)'(\d+)$/;

    // id, sig[num], sig[num:num], sig[num:num:num], sig#num
    var valid_signal = /^[A-Za-z_]([A-Za-z0-9_]|\[\d+(\:\d+(\:d+)?)?\])*(\#\d+)?$/;

    // does the proposed component/signal name meet our rules?
    function validate_name(name) {
        return name == '' || valid_name.test(name);
    }

    // does the proposed signal name meet our rules?
    function validate_signal(name) {
        if (name == '') return true;
        if (numeric_constant.test(name)) return true;

        // look for comma separated list of valid names
        var nlist = name.split(',');
        for (var i = 0; i < nlist.length; i += 1) {
            if (!valid_signal.test(nlist[i].trim())) return false;
        }
        return true;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Parse numbers in engineering notation
    //
    ///////////////////////////////////////////////////////////////////////////////

    // convert string argument to a number, accepting usual notations
    // (hex, octal, binary, decimal, floating point) plus engineering
    // scale factors (eg, 1k = 1000.0 = 1e3).
    // return default if argument couldn't be interpreted as a number
    function parse_number(x, default_v) {
        var m;

        m = x.match(/^\s*([\-+]?)0x([0-9a-fA-F]+)\s*$/); // hex
        if (m) return parseInt(m[1] + m[2], 16);

        m = x.match(/^\s*([\-+]?)0b([0-1]+)\s*$/); // binary
        if (m) return parseInt(m[1] + m[2], 2);

        m = x.match(/^\s*([\-+]?)0([0-7]+)\s*$/); // octal
        if (m) return parseInt(m[1] + m[2], 8);

        m = x.match(/^\s*[\-+]?[0-9]*(\.([0-9]+)?)?([eE][\-+]?[0-9]+)?\s*$/); // decimal, float
        if (m) return parseFloat(m[0]);

        m = x.match(/^\s*([\-+]?[0-9]*(\.([0-9]+)?)?)(a|A|f|F|g|G|k|K|m|M|n|N|p|P|t|T|u|U)\s*$/); // decimal, float
        if (m) {
            var result = parseFloat(m[1]);
            var scale = m[4];
            if (scale == 'P') result *= 1e15; // peta
            else if (scale == 't' || scale == 'T') result *= 1e12; // tera
            else if (scale == 'g' || scale == 'G') result *= 1e9; // giga
            else if (scale == 'M') result *= 1e6; // mega
            else if (scale == 'k' || scale == 'K') result *= 1e3; // kilo
            else if (scale == 'm') result *= 1e-3; // milli
            else if (scale == 'u' || scale == 'U') result *= 1e-6; // micro
            else if (scale == 'n' || scale == 'N') result *= 1e-9; // nano
            else if (scale == 'p') result *= 1e-12; // pico
            else if (scale == 'f' || scale == 'F') result *= 1e-15; // femto
            else if (scale == 'a' || scale == 'A') result *= 1e-18; // atto
            return result;
        }

        return (default_v || NaN);
    }

    // try to parse a number and generate an alert if there was a syntax error
    function parse_number_alert(s) {
        var v = parse_number(s, undefined);

        if (v === undefined) throw 'The string \"' + s + '\" could not be interpreted as an integer, a floating-point number or a number using engineering notation. Sorry, expressions are not allowed in this context.';

        return v;
    }

    function engineering_notation(n, nplaces, trim) {
        if (n === 0) return '0';
        if (n === undefined) return 'undefined';
        if (trim === undefined) trim = true;

        var sign = n < 0 ? -1 : 1;
        var log10 = Math.log(sign * n) / Math.LN10;
        var exp = Math.floor(log10 / 3); // powers of 1000
        var mantissa = sign * Math.pow(10, log10 - 3 * exp);

        // keep specified number of places following decimal point
        var mstring = (mantissa + sign * 0.5 * Math.pow(10, - nplaces)).toString();
        var mlen = mstring.length;
        var endindex = mstring.indexOf('.');
        if (endindex != -1) {
            if (nplaces > 0) {
                endindex += nplaces + 1;
                if (endindex > mlen) endindex = mlen;
                if (trim) {
                    while (mstring.charAt(endindex - 1) == '0') endindex -= 1;
                    if (mstring.charAt(endindex - 1) == '.') endindex -= 1;
                }
            }
            if (endindex < mlen) mstring = mstring.substring(0, endindex);
        }

        switch (exp) {
        case -5:
            return mstring + "f";
        case -4:
            return mstring + "p";
        case -3:
            return mstring + "n";
        case -2:
            return mstring + "u";
        case -1:
            return mstring + "m";
        case 0:
            return mstring;
        case 1:
            return mstring + "K";
        case 2:
            return mstring + "M";
        case 3:
            return mstring + "G";
        }

        // don't have a good suffix, so just print the number
        return n.toPrecision(nplaces);
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Source parsing
    //
    ///////////////////////////////////////////////////////////////////////////////

    // argument is a string describing the source's value (see comments for details)
    // source types: dc,step,square,clock,triangle,sin,pulse,pwl,pwl_repeating

    // returns an object with the following attributes:
    //   fun -- name of source function
    //   args -- list of argument values
    //   value(t) -- compute source value at time t
    //   inflection_point(t) -- compute time after t when a time point is needed
    //   period -- repeat period for periodic sources (0 if not periodic)

    function parse_source(v) {
        // generic parser: parse v as either <value> or <fun>(<value>,...)
        var src = {};
        src.period = 0; // Default not periodic
        src.value = function(t) {
            return 0;
        }; // overridden below
        src.inflection_point = function(t) {
            return undefined;
        }; // may be overridden below

        if (typeof v == 'string') {
            var m = v.match(/^\s*(\w+)\s*\(([^\)]*)\)\s*$/); // parse f(arg,arg,...)
            if (m) {
                src.fun = m[1];
                src.args = m[2].split(/\s*,\s*/).map(parse_number_alert);
            } else {
                src.fun = 'dc';
                src.args = [parse_number_alert(v)];
            }
        } else {
            src.fun = v.type;
            src.args = v.args;
        }
        //console.log(src.fun + ': ' + src.args);

        var v1,v2,voffset,va,td,tr,tf,freq,duty_cycle,pw,per,t_change,t1,t2,t3,t4,phase;

        // post-processing for constant sources
        // dc(v)
        if (src.fun == 'dc') {
            v1 = arg_value(src.args, 0, 0);
            src.args = [v];
            src.value = function(t) {
                return v1;
            }; // closure
        }

        // post-processing for impulse sources
        // impulse(height,width)
        else if (src.fun == 'impulse') {
            v1 = arg_value(src.args, 0, 1); // default height: 1
            v2 = Math.abs(arg_value(src.args, 2, 1e-9)); // default width: 1ns
            src.args = [v1, v2]; // remember any defaulted values
            pwl_source(src, [0, 0, v2 / 2, v1, v2, 0], false);
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
        // square(v_init,v_plateau,freq,duty_cycle,rise_fall)
        else if (src.fun == 'square') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1Hz
            duty_cycle = Math.min(100, Math.abs(arg_value(src.args, 3, 50))); // default duty cycle: 0.5
            t_change = Math.abs(arg_value(src.args,4,0.1e-9));   // default rise/fall: .1ns
            src.args = [v1, v2, freq, duty_cycle,t_change]; // remember any defaulted values

            per = freq === 0 ? Infinity : 1 / freq;
            pw = (.01 * duty_cycle) * (per - 2*t_change); // fraction of cycle minus rise and fall time
            pwl_source(src, [0, v1, pw, v1, pw + t_change, v2, 2*pw + t_change,
			     v2, 2*t_change + 2*pw, v1, per, v1], true);
        }

        // post-processing for clock (like square except you specify period)
        // clock(v_init,v_plateau,period,duty_cycle,rise_fall)
        else if (src.fun == 'clock') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            per = Math.abs(arg_value(src.args, 2, 100e-9)); // default period 100ns
            duty_cycle = Math.min(100, Math.abs(arg_value(src.args, 3, 50))); // default duty cycle: 0.5
            t_change = Math.abs(arg_value(src.args,4,0.1e-9));   // default rise/fall: .1ns
            src.args = [v1, v2, per, duty_cycle,t_change]; // remember any defaulted values

            pw = (.01 * duty_cycle) * (per - 2*t_change); // fraction of cycle minus rise and fall time
            pwl_source(src, [0, v1, pw, v1, pw + t_change, v2, 2*pw + t_change,
			     v2, 2*t_change + 2*pw, v1, per, v1], true);
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
        // pulse(v_init,v_plateau,t_delay,t_rise,t_fall,t_width,t_period)
        else if (src.fun == 'pulse') {
            v1 = arg_value(src.args, 0, 0); // default init value: 0V
            v2 = arg_value(src.args, 1, 1); // default plateau value: 1V
            td = Math.max(0, arg_value(src.args, 2, 0)); // time pulse starts
            tr = Math.abs(arg_value(src.args, 3, 1e-9)); // default rise time: 1ns
            tf = Math.abs(arg_value(src.args, 4, 1e-9)); // default rise time: 1ns
            pw = Math.abs(arg_value(src.args, 5, 1e9)); // default pulse width: "infinite"
            per = Math.abs(arg_value(src.args, 6, 1e9)); // default period: "infinite"
            src.args = [v1, v2, td, tr, tf, pw, per];

            t1 = td; // time when v1 -> v2 transition starts
            t2 = t1 + tr; // time when v1 -> v2 transition ends
            t3 = t2 + pw; // time when v2 -> v1 transition starts
            t4 = t3 + tf; // time when v2 -> v1 transition ends

            pwl_source(src, [t1, v1, t2, v2, t3, v2, t4, v1, per, v1], true);
        }

        // post-processing for sinusoidal sources
        // sin(v_offset,v_amplitude,freq_hz,t_delay,phase_offset_degrees)
        else if (src.fun == 'sin') {
            voffset = arg_value(src.args, 0, 0); // default offset voltage: 0V
            va = arg_value(src.args, 1, 1); // default amplitude: -1V to 1V
            freq = Math.abs(arg_value(src.args, 2, 1)); // default frequency: 1Hz
            src.period = 1.0 / freq;

            td = Math.max(0, arg_value(src.args, 3, 0)); // default time delay: 0sec
            phase = arg_value(src.args, 4, 0); // default phase offset: 0 degrees
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

        else throw 'Unrecognized source function '+src.fun;

        // object has all the necessary info to compute the source value and inflection points
        src.dc = src.value(0); // DC value is value at time 0
        return src;
    }

    function pwl_source(src, tv_pairs, repeat) {
        var nvals = tv_pairs.length;
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

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Signal parsing
    //
    ////////////////////////////////////////////////////////////////////////////////

    // see if two signal lists are the same
    function signal_equals(s1, s2) {
        if (s1.length == s2.length) {
            for (var i = 0; i < s1.length; i += 1) {
                if (s1[i] != s2[i]) return false;
            }
            return true;
        }
        return false;
    }

    // parse string into an array of symbols.  Canonicalize all text to lower case.
    //  sig_list := sig[,sig]...
    //  sig := symbol
    //      := sig#count         -- replicate sig specified number of times
    //      := sig[start:stop:step]   -- expands to sig[start],sig[start+step],...,sig[end]
    //      := number'size       -- generate appropriate list of vdd, gnd to represent number
    function parse_signal(s) {
        function parse_sig(sig) {
            var m;
            var result = [];

            // numeric constant: number'size
            // number should be acceptable to parse_number
            // size (in decimal) gives number of bits of signals
            // expands into appropriate list of vdd and gnd
            if (numeric_constant.test(sig)) {
                m = sig.match(/(.*)'(\d+)$/);
                var n = parse_number(m[1]);
                var size = parseInt(m[2],10);
                for (var i = size-1; i >= 0; i -= 1) {
                    result.push((n & (1 << i)) !== 0 ? 'vdd' : 'gnd');
                }
                return result;
            }

            // replicated signal: sig#number
            m = sig.match(/(.*)#\s*(\d+)$/);
            if (m) {
                var expansion = parse_sig(m[1].trim());
                var count = parseInt(m[2],10);
                if (isNaN(count)) return [sig];
                while (count > 0) {
                    result.push.apply(result, expansion);
                    count -= 1;
                }
                return result;
            }

            // iterated signal: sig[start:stop:step] or sig[start:stop]
            m = sig.match(/(.*)\[\s*(\-?\d+)\s*:\s*(\-?\d+)\s*(:\s*(\-?\d+)\s*)?\]$/);
            if (m) {
                var expansion = parse_sig(m[1].trim());
                var start = parseInt(m[2],10);
                var end = parseInt(m[3],10);
                var step = Math.abs(parseInt(m[5],10) || 1);
                if (end < start) step = -step;

                while (true) {
                    for (var k = 0; k < expansion.length; k += 1) {
                        result.push(expansion[k] + '[' + start.toString() + ']');
                    }
                    start += step;
                    if ((step > 0 && start > end) || (step < 0 && start < end)) break;
                }
                return result;
            }

            // what's left is treated as a simple signal name
            if (sig) return [sig.toLowerCase()];
            else return [];
        }

        // parse list of signal names
        var result = [];
        if (s !== undefined) {
            var sig_list = s.split(',');
            for (var i = 0; i < sig_list.length; i += 1) {
                var expansion = parse_sig(sig_list[i].trim());
                result.push.apply(result, expansion); // extend result with all the elements of expansion
            }
        }
        return result;
    }

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
        parse_number: parse_number,
        parse_number_alert: parse_number_alert,
        engineering_notation: engineering_notation,
        validate_name: validate_name,
        validate_signal: validate_signal,
        parse_source: parse_source,
        parse_signal: parse_signal,
        signal_equals: signal_equals
    };

}());

jade.setup = (function () {

    var configuration = {};   // default null jade configuration

    // return JSON representation to be used by server-side grader
    function getGrade() {
        return "";
    }

    // return JSON representation of persistent state
    function getState() {
        var div = $('.jade').get(0);

        // skip if this div has already been configured
        var state = {};
        if (div.jade) state = div.jade.get_state();

        return JSON.stringify(state);
    }

    // process incoming state from jsinput framework
    // This function will be called with 1 argument when JSChannel is not used,
    // 2 otherwise. In the latter case, the first argument is a transaction 
    // object that will not be used here (see http://mozilla.github.io/jschannel/docs/)
    function setState() {
        var stateStr = arguments.length === 1 ? arguments[0] : arguments[1];
        var div = $('.jade').get(0);
        if (div.jade) div.jade.initialize(JSON.parse(stateStr));
    }

    // set up editor inside of div's with class "jade"
    function setup() {
        var configuration = {};

        // if we're inside an iframe, try to reach into parent frame to get
        // configuration attributes
        if (window.parent != window) {
            // Establish a channel only if this application is embedded in an iframe.
            // This will let the parent window communicate with this application using
            // RPC and bypass SOP restrictions.
            if (window.parent !== window) {
                channel = Channel.build({
                    window: window.parent,
                    origin: "*",
                    scope: "JSInput"
                });

                channel.bind("getGrade", getGrade);
                channel.bind("getState", getState);
                channel.bind("setState", setState);
            }


            // look through all the iframes in the parent until we find ourselves
            var us;
            try {
                // the cross-domain watch dogs may not approve!
                $('iframe',window.parent.document).each(function (index,iframe) {
                    if (iframe.contentWindow == window) us = $(iframe);
                });
            } catch(err) { }

            if (us) {
                // found the iframe that owns our window, so now find configuration
                // div, if any, and grab its contents as a JSON object
                while (us.length > 0) {
                    us = us.parent();
                    var div = $('.jade-attrs',us);
                    if (div.length > 0) {
                        configuration = JSON.parse(div.text());
                        break;
                    }
                    if (us.is('span')) break;  // stop when we which <span> parent
                }
            }
        }

        // look for nodes of class "jade" and give them an editor
        $('.jade').each(function(index, div) {
            // skip if this div has already been configured
            if (div.jade === undefined) {
                // now create the editor
                var j = new jade.Jade(div);

                // start configuration with whatever is provided by <jade> tag
                var config = {};
                $.each(div.attributes,function () {
                    if (this.name != 'class') config[this.name] = this.value;
                });
                $.extend(config,configuration);  // extend with external configuration

                j.initialize(config);
            }

        });
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////

    return {
        setup: setup,   // called to initialize jade editors on this page

        // communication to/from edX jsinput framework
        getState: getState,
        setState: setState,
        getGrade: getGrade
    };

}());

// set up editor inside of div's with class "jade"
$(document).ready(jade.setup.setup);



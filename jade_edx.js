// interface iframe containing jade to edX jsinput machinery

jade.load_from_server = function (filename,callback) {
    var args = {
        async: false, // hang until load completes
        url: filename,
        type: 'GET',
        dataType: 'json',
        error: function(jqXHR, textStatus, errorThrown) {
            alert('Error while loading library '+filename+': '+errorThrown);
        },
        success: function(json) {
            if (callback) callback(json);
        }
    };
    // load file from server that served up jade
    $.ajax(args);
};

jade.save_to_server = function (json,callback) {
    // actual save will be handled by jsinput call to getState()
    return;
};

jade.unsaved_changes = function(which) {
}

jade.setup = (function () {
    // return JSON representation to be used by server-side grader
    function getGrade() {
        var div = $('.jade').get(0);
        var grade = {};
        if (div.jade) grade = div.jade.get_grade();
        return JSON.stringify(grade);
    }

    // return JSON representation of persistent state
    function getState() {
        var div = $('.jade').get(0);
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
        if (div.jade) {
            // jsinput gets anxious if we don't respond quickly, so come back to
            // initialization after we've returned and made jsinput happy.  Initialization
            // may involve loading remote libraries, which may take awhile.
            setTimeout(function () { div.jade.initialize(JSON.parse(stateStr)); },1);
        }
    }

    // set up editor inside of div's with class "jade"
    var channel;
    function setup() {
        // Establish a channel only if this application is embedded in an iframe.
        // This will let the parent window communicate with this application using
        // RPC and bypass SOP restrictions.
        if (window.parent !== window && channel === undefined) {
            channel = Channel.build({
                window: window.parent,
                origin: "*",
                scope: "JSInput"
            });

            channel.bind("getGrade", getGrade);
            channel.bind("getState", getState);
            channel.bind("setState", setState);

            // make iframe resizable if we can.  This may fail if we don't have
            // access to our parent...
            try {
                // look through all our parent's iframes
                $('iframe',window.parent.document).each(function () {
                    // is this iframe us?
                    if (this.contentWindow == window) {
                        // yes! so add css to enable resizing
                        $(this).css({resize:'both', overflow:'auto'});
                    }
                });
            } catch (e) {
            }
        }

        // look for nodes of class "jade" and give them an editor
        $('.jade').each(function(index, div) {
            // skip if this div has already been configured
            if (div.jade === undefined) {
                var config = {};

                // use text from jade.div, if any
                var text = $(div).text().trim();
                $(div).empty();  // all done with innards
                if (text) config = JSON.parse(text);

                // now create the editor, pass along initial configuration
                var j = new jade.Jade(div);
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

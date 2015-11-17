// save/restore state from browser's localStorage

jade_defs.services = function (jade) {
    var host;   // window target for state updates
    var jade_instance;  // jade instance whose state we'll save

    jade.model.AUTOSAVE_TRIGGER = 1;  // save after every edit

    jade.load_from_server = function (filename,shared,callback) {
    };

    jade.save_to_server = function (json,callback) {
        try {
            // grab the complete state and save it away
            var state = $('.jade')[0].jade.get_state();
            localStorage.setItem(window.location.pathname,JSON.stringify(state));
            if (callback) callback();
        } catch (e) {
            console.log('Failed to save state in localStorage.');
        }
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  // not used here...

    // set up editor inside of div's with class "jade"
    jade.setup = function (div,setup_channel) {
        // skip if this div has already been configured
        if (div.jade === undefined) {
            var config = {};

            // use text from jade.div, if any
            var text = $(div).html();
            // strip off <!--[CDATA[ ... ]]--> tag if it's there
            if (text.lastIndexOf('<!--[CDATA[',0) === 0) {
                text = text.substring(11,text.length-5);
            }

            $(div).empty();  // all done with innards
            if (text)
                try {
                    config = JSON.parse(text);
                } catch(e) {
                    console.log('Error parsing configuration: '+e);
                }

            // standalone mode -- module data stored locally
            var saved_state = localStorage.getItem(window.location.pathname);
            if (saved_state) {
                try {
                    saved_state = JSON.parse(saved_state);
                    $.extend(config,saved_state);
                } catch (e) {
                    console.log('Restore of local state failed');
                    console.log(e.stack);
                }
            }

            // now create the editor, pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);
        }
    };
};

// set up editor inside of the div's with class "jade"
var jade = {};
$(document).ready(function () {
    $('.jade').each(function(index, div) {
        var j = new jade_defs.jade();
        jade_defs.services(j);

        // only the first Jade div can interact with host framework
        j.setup(div,index == 0);
        if (index == 0) {
            jade.initialize = j.initialize;
        }
    });
});

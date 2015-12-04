// save/restore state from browser's localStorage

jade_defs.services = function (jade) {
    var host;   // window target for state updates
    var jade_instance;  // jade instance whose state we'll save

    jade.model.set_autosave_trigger(1);  // save after every edit

    jade.load_from_server = function (filename,shared,callback) {
    };

    jade.save_to_server = function (json,callback) {
        try {
            // grab the complete state and save it away
            //var state = $('.jade')[0].jade.get_state();
            //localStorage.setItem(window.location.pathname,JSON.stringify(state));
            //if (callback) callback();

            // send to local server
            jade.cloud_upload($('.jade')[0].jade,window.location.origin,callback);
        } catch (e) {
            console.log('Failed to save state in localStorage.');
        }
    };

    jade.cloud_upload = function (j,url,callback) {
        if (url === undefined) url = j.configuration.cloud_url;
        var args = {
            url: url,
            type: 'POST',
            dataType: 'text',
            data: {key: window.location.pathname, value: JSON.stringify(j.get_state())},
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('Error: '+errorThrown);
            },
            success: function(result) {
                if (callback) callback();
                //console.log('upload complete');
            }
        };
        $.ajax(args);
    };

    jade.cloud_download = function (j,url) {
        if (url === undefined) url = j.configuration.cloud_url;
        var args = {
            url: url,
            type: 'POST',
            dataType: 'text',
            data: {key: window.location.pathname},
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('Error: '+errorThrown);
            },
            success: function(result) {
                //localStorage.setItem(window.location.pathname,result);
                var config = {};
                $.extend(config,initial_config);
                if (result) $.extend(config,JSON.parse(result));
                j.initialize(config);
            }
        };
        $.ajax(args);

        //console.log('cloud_download');
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  // not used here...

    var initial_config;

    // set up editor inside of div's with class "jade"
    jade.setup = function (div,setup_channel) {
        // skip if this div has already been configured
        if (div.jade === undefined) {

            // use text from jade.div, if any
            var div_text = $(div).html();
            // strip off <!--[CDATA[ ... ]]--> tag if it's there
            if (div_text.lastIndexOf('<!--[CDATA[',0) === 0) {
                div_text = div_text.substring(11,text.length-5);
            }

            $(div).empty();  // all done with innards
            if (div_text)
                try {
                    initial_config = JSON.parse(div_text);
                } catch(e) {
                    console.log('Error parsing configuration: '+e);
                }
            else initial_config = {};

            /*
            var config = {};
            $.extend(config,initial_config);

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
             */

            // now create the editor, pass along initial configuration
            var j = new jade.Jade(div);

            // initialize with state from server
            //j.initialize(config);
            jade.cloud_download(j,window.location.origin);
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

// interface iframe containing jade to edX jsinput machinery

jade_defs.services = function (jade) {
    var channel;   // jschannel connection to parent frame
    var jade_instance;  // jade instance whose state we'll save

    jade.load_from_server = function (filename,shared,callback) {
        var args = {
            async: false, // hang until load completes
            url: filename,
            type: 'GET',
            datatype: 'json',
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
        json = jade_instance.get_state();
        channel.call({
            method: 'update',
            params: json,
            success: function (v) { if (callback) callback(); },
            error: function (e) { console.log(e); }
        });
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  // not used here...

    // process incoming state from jsinput framework
    // This function will be called with 1 argument when JSChannel is not used,
    // 2 otherwise. In the latter case, the first argument is a transaction 
    // object that will not be used here (see http://mozilla.github.io/jschannel/docs/)
    jade.initialize = function () {
        var stateStr = arguments.length === 1 ? arguments[0] : arguments[1];
        var div = $('.jade').get(0);
        if (div.jade) {
            // jsinput gets anxious if we don't respond quickly, so come back to
            // initialization after we've returned and made jsinput happy.  Initialization
            // may involve loading remote libraries, which may take awhile.
            setTimeout(function () { div.jade.initialize(JSON.parse(stateStr)); },1);
        }
    };

    // set up editor inside of div's with class "jade"
    jade.setup = function (div,setup_channel) {
        if (setup_channel) {
            // Establish a channel only if this application is embedded in an iframe.
            // This will let the parent window communicate with this application using
            // RPC and bypass SOP restrictions.
            if (window.parent !== window && channel === undefined) {
                channel = Channel.build({
                    window: window.parent,
                    origin: "*",
                    scope: "workbook"
                });

                channel.bind("initialize", jade.initialize);

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
        }

        // skip if this div has already been configured
        if (div.jade === undefined) {
            // if this Jade needs to save state, make sure user
            // doesn't navigate away unintentionally
            if ($(div).hasClass('jade-save-state'))
                jade.unsaved_changes = function(which) {
                    if (which && $('body').attr('data-dirty') === undefined)
                        $('body').attr('data-dirty','true');
                    else if (!which && $('body').attr('data-dirty') !== undefined)
                        $('body').removeAttr('data-dirty');
                };

            var config = {};

            // use text from jade.div, if any
            var text = $(div).text().trim();
            $(div).empty();  // all done with innards
            if (text)
                try {
                    config = JSON.parse(text);
                } catch(e) {
                    console.log('Error parsing configuration: '+e);
                }

            // now create the editor, pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);

            if (setup_channel) jade_instance = j;
        }
    };
};

// set up editor inside of the div's with class "jade"
var jade = {};
$(document).ready(function () {
    $('.jade').each(function(index, div) {
        var j = new jade_defs.jade();
        jade_defs.services(j);
        // only the first Jade div can interact with edX framework
        j.setup(div,index == 0);
        if (index == 0) {
            jade.initialize = j.initialize;
        }
    });
});

// notify user of unsaved changes
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});
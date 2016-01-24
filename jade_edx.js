// interface iframe containing jade to edX jsinput machinery

jade_defs.services = function (jade) {

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

    // actual save will be handled by jsinput call to getState()
    jade.save_to_server = function (json,callback) {
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  // not used here...

    // return JSON representation to be used by server-side grader
    jade.getGrade = function () {
        var div = $('.jade').get(0);
        var grade = {};
        if (div.jade) grade = div.jade.get_grade();
        return JSON.stringify(grade);
    };

    // return JSON representation of persistent state
    jade.getState = function () {
        var div = $('.jade').get(0);
        var state = {};
        if (div.jade) state = div.jade.get_state();
        return JSON.stringify(state);
    };

    // process incoming state from jsinput framework
    // This function will be called with 1 argument when JSChannel is not used,
    // 2 otherwise. In the latter case, the first argument is a transaction 
    // object that will not be used here (see http://mozilla.github.io/jschannel/docs/)
    jade.setState = function () {
        var stateStr = arguments.length === 1 ? arguments[0] : arguments[1];
        var div = $('.jade').get(0);
        if (div.jade) {
            // jsinput gets anxious if we don't respond quickly, so come back to
            // initialization after we've returned and made jsinput happy.  Initialization
            // may involve loading remote libraries, which may take awhile.
            setTimeout(function () {
                var state = {};
                var saved_state = JSON.parse(stateStr);

                // temporary hack to get initial-state from parent window
                try {
                    if (window.parent !== window) {
                        // look through all our parent's iframes
                        $('iframe',window.parent.document).each(function () {
                            // is this iframe us?
                            if (this.contentWindow == window) {
                                // locate our state in hidden input field in parent
                                var n = $(this).attr('name');    // name attribute of iframe: "iframe_..."
                                if (n.lastIndexOf('iframe_',0) != 0) return;
                                n = '#inputtype' + n.substr(6);  // convert to "inputtype_..."
                                var section = $(n,window.parent.document);   // find associated section tag
                                if (section.length == 1) {
                                    // grab initial state
                                    state = JSON.parse(section.attr('data-initial-state') || '{}');
                                    if (saved_state.help_url) delete saved_state.help_url;
                                    if (saved_state.student_id) delete saved_state.student_id;
                                }
                            }
                        });
                    }
                } catch (e) {
                }

                $.extend(state,saved_state);
                div.jade.initialize(state);
            },1);
        }
    };

    // set up editor inside of div's with class "jade"
    jade.setup = function (div,setup_channel) {
        if (setup_channel) {
            // Establish a channel only if this application is embedded in an iframe.
            // This will let the parent window communicate with this application using
            // RPC and bypass SOP restrictions.
            var channel;
            if (window.parent !== window && channel === undefined) {
                channel = Channel.build({
                    window: window.parent,
                    origin: "*",
                    scope: "JSInput"
                });

                channel.bind("getGrade", jade.getGrade);
                channel.bind("getState", jade.getState);
                channel.bind("setState", jade.setState);

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
        // only the first Jade div can interact with edX framework
        j.setup(div,index == 0);
        if (index == 0) {
            jade.getState = j.getState;
            jade.setState = j.setState;
            jade.getGrade = j.getGrade;
        }
    });
});

// notify user of unsaved changes
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});

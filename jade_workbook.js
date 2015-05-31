// interface iframe or window containing jade to workbook machinery

jade_defs.services = function (jade) {
    var host;   // window target for state updates
    var jade_instance;  // jade instance whose state we'll save

    jade.load_from_server = function (filename,shared,callback) {
    };

    jade.save_to_server = function (json,callback) {
        // standalone: update saved state
        localStorage.setItem(window.location.pathname,json);
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  // not used here...

    // set up editor inside of div's with class "jade"
    jade.setup = function (div,setup_channel) {
        if (window.parent !== window) {
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

            // standalone mode... change if message arrives
            var saved_state = localStorage.getItem(window.location.pathname);
            if (saved_state)
                $.extend(config,JSON.parse(saved_state));

            // now create the editor, pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);

            if (setup_channel) {
                // accept initialization message from host, remember where
                // to send update messages when local state changes
                $(window).on('message',function (event) {
                    event = event.originalEvent;
                    if (event.origin != window.location.origin) return;

                    var host = event.source;
                    // {value: , check: , message: , id: }
                    var answer = JSON.parse(event.data);

                    // change save_to_server to communicate with host
                    if (answer.id) {
                        jade.save_to_server = function (json,callback) {
                            // update answer object
                            var state = j.get_state();
                            answer.value = JSON.stringify(state);
                            // to-do: check required tests, update correct, msg

                            // send it to our host
                            host.postMessage(JSON.stringify(answer),window.location.origin);

                            // done...
                            if (callback) callback();
                        };
                    }

                    var state = JSON.parse(answer.value);
                    j.initialize(state);
                });
            };
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

// notify user of unsaved changes
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});

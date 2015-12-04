// interface iframe or window containing jade to workbook machinery

jade_defs.services = function (jade) {
    var host;   // window target for state updates
    var jade_instance;  // jade instance whose state we'll save

    jade.model.set_autosave_trigger(1);  // save after every edit

    jade.load_from_server = function (filename,shared,callback) {
    };

    jade.save_to_server = function (json,callback) {
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

                            // if there are tests, see if they've been run
                            answer.message = undefined;
                            answer.check = undefined;
                            var completed_tests = state['tests'];
                            if (completed_tests) {
                                // make sure all required tests passed
                                answer.check = 'right';
                                $.each(state['required-tests'] || [],function (index,test) {
                                    // test results: error msg or "passed <md5sum> <mverify_md5sum> <benmark>"
                                    var result = (completed_tests[test] || 'Test has not been run: '+test);
                                    if (result.lastIndexOf('passed',0) !== 0) {
                                        if (answer.message) answer.message += '\n' + result;
                                        else answer.message = result;
                                        answer.check = 'wrong';
                                    }
                                });
                            }

                            // send it to our host
                            host.postMessage(JSON.stringify(answer),window.location.origin);

                            // done...
                            if (callback) callback();
                        };
                    }

                    if (answer.value) {
                        var state = JSON.parse(answer.value);
                        j.initialize(state);
                    }
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

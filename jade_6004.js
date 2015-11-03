// sandbox can only load shared modules
jade_defs.services = function (jade) {
    jade.load_from_server = function (filename,shared,callback) {
    };

    // sandbox doesn't save changes
    jade.save_to_server = function (json,callback) {
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  //'/jade-server?zip=1';

    // return JSON representation of persistent state
    jade_defs.getState = function() {
        var div = $('.jade').get(0);
        var state = {};
        if (div.jade) state = div.jade.get_state();
        return JSON.stringify(state);
    };

    jade.setup = function (div) {
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

            // are we in an iframe?
            if (window.parent !== window) {
                // make iframe resizable if we can.  This may fail if we don't have
                // access to our parent...
                try {
                    // look through all our parent's iframes
                    var foo;
                    $('iframe',window.parent.document).each(function () {
                        // is this iframe us?
                        if (this.contentWindow == window) {
                            foo = this;
                            // yes! so add css to enable resizing
                            $(this).css({resize:'both', overflow:'auto'});

                            // initial state is JSON stored as text child of <iframe>
                            var state = JSON.parse($(this).text() || '{}');

                            // grab our server-side state from the appropriate input field
                            var id = $(this).attr('data-id');
                            if (id) {
                                var input = $("[name='"+id+"']",window.parent.document);
                                if (input) {
                                    // overwrite with user's state from server
                                    input = input.val();
                                    if (input.length > 0) {
                                        var args = JSON.parse(input);
                                        args.student_id = window.parent.anonymous_student_id;
                                        $.extend(state,args);
                                    }
                                }
                            }

                            var j = new jade.Jade(div);
                            j.initialize(state);
                        }
                    });
                } catch (e) {
                    alert(e.stack ? e.stack : e);
                }
            } else {
                var text = $(div).text().trim();

                // starting state is given by text from jade.div, if any
                var config = {};
                $(div).empty();  // all done with innards
                if (text) {
                    try {
                        state = JSON.parse(text);
                    } catch(e) {
                        console.log('Error parsing configuration: '+e);
                    }
                }

                // now create the editor and pass along initial configuration
                var j = new jade.Jade(div);
                j.initialize(config);
            }
        }
    };
};

// set up editor inside of div's with class "jade"
$(document).ready(function () {
    $('.jade').each(function(index, div) {
        var j = new jade_defs.jade();
        jade_defs.services(j);
        j.setup(div);
    });
});

// notify user of unsaved changes
$(window).on('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});

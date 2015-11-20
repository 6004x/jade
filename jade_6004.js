// sandbox can only load shared modules
jade_defs.services = function (jade) {
    jade.load_from_server = function (filename,shared,callback) {
        if (!shared) {
            alert('Sandbox can only load shared modules.');
        } else {
            var args = {
                async: false, // hang until load completes
                url: 'https://6004.mit.edu/coursewarex/' + filename,
                type: 'POST',
                dataType: 'json',
                error: function(jqXHR, textStatus, errorThrown) {
                    alert('Error while loading file '+filename+': '+errorThrown);
                },
                success: function(result) {
                    if (callback) callback(result);
                }
            };
            $.ajax(args);
        }
    };

    // sandbox doesn't save changes
    jade.save_to_server = function (json,callback) {
    };

    jade.unsaved_changes = function(which) {
    };

    jade.request_zip_url = undefined;  //'/jade-server?zip=1';

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

            // now create the editor and pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);
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
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});

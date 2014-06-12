// set up editor inside of div's with class "jade"
$(document).ready(function() {
    // look for nodes of class "jade" and give them an editor
    $('.jade').each(function(index, node) {
        if (node.jade === undefined) new jade.Jade(node);
    });
});


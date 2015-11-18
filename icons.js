// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.icons = function(jade) {

    jade.icons = {};

    jade.icons.grid_icon = '<span class="fa fa-fw fa-th"></span>';

    jade.icons.actions_icon = '<span class="fa fa-file-o"></span>';

    jade.icons.close_icon = '<span class="fa fa-times fa-inverse"></span>';

    jade.icons.resize_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 10 13.5 l 3 -3 m 0 -3 l -6 6 m -3 0 l 9 -9" stroke="black" stroke-width="0.5"/>' +
        '</svg>';

    jade.icons.undo_icon = '<span class="fa fa-fw fa-reply"></span>';

    jade.icons.redo_icon = '<span class="fa fa-fw fa-share"></span>';

    jade.icons.cut_icon = '<span class="fa fa-fw fa-cut"></span>';

    jade.icons.copy_icon = '<span class="fa fa-fw fa-copy"></span>';

    jade.icons.paste_icon = '<span class="fa fa-fw fa-paste"></span>';

    jade.icons.fliph_icon = '<span class="fa fa-fw fa-arrows-h"></span>';

    jade.icons.flipv_icon = '<span class="fa fa-fw fa-arrows-v"></span>';

    jade.icons.rotcw_icon = '<span class="fa fa-fw fa-rotate-right"></span>';

    jade.icons.rotccw_icon = '<span class="fa fa-fw fa-rotate-left"></span>';

    jade.icons.up_icon = '<span class="fa fa-fw fa-level-up"></span>';

    jade.icons.down_icon = '<span class="fa fa-fw fa-level-down"></span>';

    jade.icons.ground_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 8.5 3.5 v 7 h -5 l 5 5 l 5 -5 h -5" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.vdd_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 8.5 5.5 v 8 M 3.5 5.5 h 10" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.port_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 1.5 6.5 h 7 l 4 4 l -4 4 h -7 v -8 m 11 4 h 5" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.jumper_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 4 12 C 4 6, 12 6, 12 12" stroke="black" fill="transparent"/>' +
        '<circle cx="4" cy="12" r="1" stroke="black"/>' +
        '<circle cx="12" cy="12" r="1" stroke="black"/>' +
        '</svg>';

    jade.icons.text_icon = '<span class="fa fa-fw fa-font"></span>';

    jade.icons.check_icon = '<span class="fa fa-fw fa-check" style="color:green;"></span>';

    jade.icons.select_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 3.5 3.5 v 9 l 2 -2 l 2 5 l 3 -2 l -2 -4 l 2.5 -0.5 L 3.5 3.5" fill="black"/>' +
        '</svg>';

    jade.icons.line_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 3.5 5.5 l 10 10" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.arc_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 3.5 5.5 c 8 0, 10 8, 10 10" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.circle_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<circle cx="8" cy="10" r="5" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.property_icon = '<span>{P}</span>'; // just text

    jade.icons.terminal_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
        '<circle cx="5" cy="10" r="3" stroke="black" fill="transparent"/>' +
        '<path d="M 5 10 h 8" stroke="black" fill="transparent"/>' +
        '</svg>';

    jade.icons.dc_icon = '<span style="position: relative; top: 4px;"><svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 2 2 h 12" stroke="black" stroke-width="1.5"/>' +
        '<path d="M 2 12 h 12" stroke="black" stroke-dasharray="2,1"/>' +
        '</svg></span>';

    jade.icons.sweep_icon = '<span style="position: relative; top: 2px;"><svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 0 14 h 16" stroke="black" stroke-width=".75"/>' +
        '<path d="M 0 14 L 6 10 16 9" stroke="black" stroke-width=".75" fill="none"/>' +
        '<path d="M 0 14 L 5 8 8 6 16 4" stroke="black" stroke-width=".75" fill="none"/>' +
        '<path d="M 0 14 L 4 6 6 4 8 2 16 0" stroke="black" stroke-width=".75" fill="none"/>' +
        '</svg></span>';

    jade.icons.ac_icon = '<span style="position: relative; top: 2px;"><svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 0 8 T 3 2 8 8 13 14 16 8" stroke="black" stroke-width="1.5" fill="none"/>' +
        '</svg></span>';

    jade.icons.tran_icon = '<span style="position: relative; top: 2px;"><svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 12 0 v 4 h -4 v 8 h 4 v 4" stroke="black" fill="none"/>' +
        '<path d="M 5 4 v 8 M 5 8 h -4" stroke="black" fill="none"/>' +
        '</svg></span>';

    jade.icons.gate_icon = '<span style="position: relative; top: 2px;"><svg width="16" height="16" viewBox="0 0 16 16">' +
        '<path d="M 0 4 h 6 M 0 12 h 6 M 6 2 v 12 M 12 8 h 4 M 6 2 C 6 2 12 0 12 8 M 6 14 C 6 15 12 14 12 8" stroke="black" fill="none"/>' +
        '</svg></span>';

    jade.icons.timing_icon = '<span class="fa fa-fw fa-lg fa-clock-o"></span>';

    jade.icons.edit_module_icon = '<span class="fa fa-fw fa-lg fa-pencil-square-o fa-lg"></span>';

    jade.icons.copy_module_icon = '<span class="fa fa-fw fa-lg fa-copy fa-lg"></span>';

    jade.icons.delete_module_icon = '<span class="fa fa-fw fa-lg fa-trash-o fa-lg"></span>';

    jade.icons.readonly = '<i class="fa fa-ban" style="color:red;"></i>';

    jade.icons.download_icon = '<span class="fa fa-fw fa-lg fa-download"></span>';

    jade.icons.upload_icon = '<span class="fa fa-fw fa-lg fa-upload"></span>';

    jade.icons.recycle_icon = '<span class="fa fa-fw fa-lg fa-recycle"></span>';

    jade.icons.mail_icon = '<span class="fa fa-fw fa-lg fa-envelope-o"></span>';

    jade.icons.cloud_download_icon = '<span class="fa fa-fw fa-lg fa-cloud-download"></span>';
    jade.icons.cloud_upload_icon = '<span class="fa fa-fw fa-lg fa-cloud-upload"></span>';

};

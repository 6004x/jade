module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            options: {
                separator: ';{}' // hack that 'works' for both JavaScript and CSS.
            }
        },
        copy: {
            jade_edx: {expand: true,
                       flatten: true,
                       src: ['jade_edx.html', 'jade.css', 'libraries/shared/analog', 'libraries/shared/gates'],
                       dest: 'edX/'
                       }
        },
        uglify: {
            options: {
                beautify: {
                    ascii_only: true, // This prevents us screwing up on servers that don't sent correct content headers.
                    beautify: false
                }
            }
        },
        useminPrepare: {
            jade_edx: 'jade_edx.html',
            options: {
                dest: 'edX'
            }
        },
        usemin: {
            jade_edx: {
                src: 'edX/jade_edx.html',
                options: {type: 'html'}
            },
            options: {
                dirs: ['edX']
            }
        },
    });

    grunt.loadNpmTasks('grunt-usemin');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');

    //grunt.registerTask('jade_edx', ['copy:jade_edx', 'useminPrepare:jade_edx', 'concat', 'uglify', 'usemin:jade_edx']);
    grunt.registerTask('jade_edx', ['copy:jade_edx', 'useminPrepare:jade_edx', 'concat', 'usemin:jade_edx']);

    // Builds everything if just called as 'grunt'
    grunt.registerTask('default', ['jade_edx']);
}

module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            options: {
                separator: ';{}' // hack that 'works' for both JavaScript and CSS.
            }
        },
        copy: {
            jade: {src: ['jade.html', 'jade.css', 'analog', 'gates'], dest: 'edX/'}
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
            jade: 'jade.html',
            options: {
                dest: 'edX'
            }
        },
        usemin: {
            jade: {
                src: 'edX/jade.html',
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

    grunt.registerTask('jade', ['copy:jade', 'useminPrepare:jade', 'concat', 'uglify', 'usemin:jade']);

    // Builds everything if just called as 'grunt'
    grunt.registerTask('default', ['jade']);
}

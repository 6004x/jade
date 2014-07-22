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
                       src: ['jade_edx.html', 'jade.css', '../libraries/shared/analog', '../libraries/shared/gates'],
                       dest: 'build/'
                       },
            jade: {expand: true,
                   flatten: true,
                   src: ['jade.html', 'jade.css'],
                   dest: 'build/'
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
            jade: 'jade.html',
            options: {
                dest: 'build'
            }
        },
        usemin: {
            jade_edx: {
                src: 'build/jade_edx.html',
                options: {type: 'html'}
            },
            jade: {
                src: 'build/jade.html',
                options: {type: 'html'}
            },
            options: {
                dirs: ['build']
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
    grunt.registerTask('jade_edx', ['copy:jade_edx', 'useminPrepare:jade_edx', 'concat', 'uglify', 'usemin:jade_edx']);
    grunt.registerTask('jade', ['copy:jade', 'useminPrepare:jade', 'concat', 'uglify', 'usemin:jade']);

    // Builds everything if just called as 'grunt'
    grunt.registerTask('default', ['jade']);
}

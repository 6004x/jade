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
                       src: ['jade_edx.html', 'jade.css', 'files/analog', 'files/gates'],
                       dest: 'build/'
                       },
            jade_6004: {expand: true,
                           flatten: true,
                           src: ['jade_6004.html', 'jade.css', 'files/analog', 'files/gates'],
                           dest: 'build/'
                          },
            jade: {expand: true,
                   flatten: true,
                   src: ['jade.html', 'jade.css'],
                   dest: 'build/'
                  },
            font_awesome: {expand: true,
                           flatten: true,
                           src:['font-awesome/4.2.0/fonts/*'],
                           dest: 'build/'
                          }
        },
        uglify: {
            options: {
                mangle: false,   // preserve function names
                beautify: {
                    ascii_only: true, // This prevents us screwing up on servers that don't sent correct content headers.
                    beautify: false
                }
            }
        },
        useminPrepare: {
            jade_edx: 'jade_edx.html',
            jade_6004: 'jade_6004.html',
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
            jade_6004: {
                src: 'build/jade_6004.html',
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

    grunt.registerTask('jade_6004', ['copy:jade_6004', 'copy:font_awesome', 'useminPrepare:jade_6004', 'concat', 'uglify', 'usemin:jade_6004']);
    grunt.registerTask('jade_edx', ['copy:jade_edx', 'copy:font_awesome', 'useminPrepare:jade_edx', 'concat', 'uglify', 'usemin:jade_edx']);
    grunt.registerTask('jade', ['copy:jade', 'copy:font_awesome', 'useminPrepare:jade', 'concat', 'uglify', 'usemin:jade']);

    // Builds everything if just called as 'grunt'
    grunt.registerTask('default', ['jade_6004']);
};

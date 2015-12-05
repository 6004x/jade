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
                       src: ['jade_edx.html', 'jade.css'],
                       dest: 'build/'
                       },
            jade_workbook: {expand: true,
                            flatten: true,
                            src: ['jade_workbook.html', 'jade.css'],
                            dest: 'build/'
                           },
            jade: {expand: true,
                              flatten: true,
                              src: ['jade.html','jade.css','server.py', 'README.standalone'],
                              dest: 'build/'
                             },
            jade_6004: {expand: true,
                           flatten: true,
                           src: ['jade_6004.html', 'jade.css'],
                           dest: 'build/'
                          },
            jade_local: {expand: true,
                   flatten: true,
                   src: ['jade_local.html', 'jade.css'],
                   dest: 'build/'
                  },
            font_awesome: {expand: true,
                           flatten: true,
                           src:['fontawesome-webfont*','FontAwesome.otf'],
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
            jade_workbook: 'jade_workbook.html',
            jade: 'jade.html',
            jade_6004: 'jade_6004.html',
            jade_local: 'jade_local.html',
            options: {
                dest: 'build'
            }
        },
        usemin: {
            jade_edx: {
                src: 'build/jade_edx.html',
                options: {type: 'html'}
            },
            jade_workbook: {
                src: 'build/jade_workbook.html',
                options: {type: 'html'}
            },
            jade: {
                src: 'build/jade.html',
                options: {type: 'html'}
            },
            jade_6004: {
                src: 'build/jade_6004.html',
                options: {type: 'html'}
            },
            jade_local: {
                src: 'build/jade_local.html',
                options: {type: 'html'}
            },
            options: {
                dirs: ['build']
            }
        }
    });

    grunt.loadNpmTasks('grunt-usemin');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');

    grunt.registerTask('jade_6004', ['copy:jade_6004', 'copy:font_awesome', 'useminPrepare:jade_6004', 'concat', 'uglify', 'usemin:jade_6004']);
    grunt.registerTask('jade_edx', ['copy:jade_edx', 'copy:font_awesome', 'useminPrepare:jade_edx', 'concat', 'uglify', 'usemin:jade_edx']);
    grunt.registerTask('jade_workbook', ['copy:jade_workbook', 'copy:font_awesome', 'useminPrepare:jade_workbook', 'concat', 'uglify', 'usemin:jade_workbook']);
    grunt.registerTask('jade', ['copy:jade', 'copy:font_awesome', 'useminPrepare:jade', 'concat', 'uglify', 'usemin:jade']);
    grunt.registerTask('jade_local', ['copy:jade_local', 'copy:font_awesome', 'useminPrepare:jade_local', 'concat', 'usemin:jade_local']);

    // Builds everything if just called as 'grunt'
    grunt.registerTask('default', ['jade']);
};

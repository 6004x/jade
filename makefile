# Makefile for Jade subtree

# Here's the directory containing MY files:
MYFILES=files/$(USER)

what:
	@echo "Make what?  Plausible args include"
	@echo
	@echo "  make run              run local copy of Jade, using MYFILES"
	@echo

	@echo "  make run-cjt          run local copy of Jade, using cjt's files"
	@echo "  make run-ward         run local copy of Jade, using ward's files"
	@echo "  make run-notes        run local copy of Jade, using notes files"
	@echo "  make run-bugs         run local copy of Jade, using bugs files"

	@echo
	@echo "  make push-mine        Update your files: push/commit/git push them"
	@echo "  make push-cjt         Update CJT's files in next git commit/push"
	@echo "  make push-ward        Update ward's files in next git commit/push"
	@echo "  make push-notes       Update notes files in next git commit/push"
	@echo "  make push-bugs        Update bugs files in next git commit/push"
	@echo

	@echo "  make commit           update modified/deleted files prior to git push"
	@echo "  make pull             update files from git repository"

	@echo
	@echo "Run Some ad-hoc example files:"
	@echo "  make run-beta         Run Jade on beta:vanilla"
	@echo "  make run-mul32        32-bit multiplier, approach 2 (not working)"

	@echo
	@echo "  make beta-json        Readable version of a json file (needs underscore)"

	@echo
	@echo "  make run-bug         /bugs/mul4_1 runs, mul4_2 shows empty error bug"

################################################################################
### GIT interface commands:
################################################################################

pull:
	git pull
	chmod 777 files/*


commit:
	git commit -a -m "`date`"


# Add/delete my files to/from the GIT repo:
push-mine:	$(MYFILES)
		git add --all $(MYFILES)
		git commit -a -m "Pushed my edited Jade files"
		git push

push-notes:	files/notes
		git add --all files/notes

push-bugs:	files/bugs
		git add --all files/bugs

################################################################################
### Running from local git sandbox
### Prereqs:
###   - Apache, configured so that
###      - http://localhost/jade accesses this directory
###      - CGI scripts executable from localhost/jade
###         (Options ExecCGI, AddHandler cgi-script .cgi)
###   - Jade files to be accessed in files
################################################################################

run:
	chrome "http://localhost/jade/jade_local.html?modules=$(USER)"

# Alternative run commands, pointing at different module directories:

run-cjt:
	chrome "http://localhost/jade/jade_local.html?modules=cjt"

run-ward:
	chrome "http://localhost/jade/jade_local.html?modules=ward"

run-notes:
	chrome "http://localhost/jade/jade_local.html?modules=notes"

run-bugs:
	chrome "http://localhost/jade/jade_local.html?modules=bugs"

# ad-hoc run commands to show various examples:

run-beta:
	chrome "http://localhost/jade/jade_local.html?modules=ward&edit=/beta/vanilla"

run-mul32:
	chrome "http://localhost/jade/jade_local.html?modules=ward&edit=/mul/mul32"

run-bug:
	chrome "http://localhost/jade/jade_local.html?modules=ward&edit=/bugs/mul4_1"


# ad-hoc target to show json of a file:
beta-json:
	cat files/ward/beta | underscore print

analog.js: files/analog
	-- echo "jade_defs.analog = function (jade) { jade.model.load_json(" >analog.js
	-- cat files/analog >>analog.js
	-- echo ",true);};" >>analog.js

gates.js: files/gates
	-- echo "jade_defs.gates = function (jade) { jade.model.load_json(" >gates.js
	-- cat files/gates >>gates.js
	-- echo ",true);};" >>gates.js

edx:	analog.js gates.js
	grunt jade_edx
	cp build/jade_edx* build/jade.css build/FontAwesome.otf build/fontawesome-webfont.* ~/git/6.004_mitx/static/

6004:	analog.js gates.js
	grunt jade_6004
	scp build/jade_6004* build/jade.css build/FontAwesome.otf build/fontawesome-webfont.* 6004:coursewarex/

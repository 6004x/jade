# Makefile for Jade subtree

# Here's the directory containing MY files:
MYFILES=src/files/$(USER)

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
	@echo "  make push-mine        Update your files in next git commit/push"
	@echo "  make push-cjt         Update CJT's files in next git commit/push"
	@echo "  make push-ward        Update ward's files in next git commit/push"
	@echo "  make push-notes       Update notes files in next git commit/push"
	@echo "  make push-bugs        Update bugs files in next git commit/push"
	@echo

	@echo "  make commit           update modified/deleted files prior to git push"
	@echo "  make pull             update files from git repository"

	@echo
	@echo "  make beta-json        Readable version of a json file"

################################################################################
### GIT interface commands:
################################################################################

pull:
	git pull
	chmod 777 src/files/* src/files/*/*


commit:
	git commit -a -m "`date`"


# Add/delete my files to/from the GIT repo:
push-mine:	$(MYFILES)
		git add --all $(MYFILES)

push-notes:	src/files/notes
		git add --all src/files/notes

push-bugs:	src/files/bugs
		git add --all src/files/bugs



################################################################################
### Running from local git sandbox
### Prereqs:
###   - Apache, configured so that
###      - http://localhost/jade accesses this directory
###      - CGI scripts executable from localhost/jade/src
###         (Options ExecCGI, AddHandler cgi-script .cgi)
###   - Jade files to be accessed in src/files
################################################################################

run:
	chrome "http://localhost/jade/src/jade_local.html?dir=$(USER)"

# Alternative run commands, pointing at different module directories:

run-cjt:
	chrome "http://localhost/jade/src/jade_local.html?dir=cjt"

run-ward:
	chrome "http://localhost/jade/src/jade_local.html?dir=cjt"

run-notes:
	chrome "http://localhost/jade/src/jade_local.html?dir=notes"

run-bugs:
	chrome "http://localhost/jade/src/jade_local.html?dir=bugs"

# ad-hoc target to show json of a file:
beta-json:
	cat src/files/ward/beta | underscore print

# Copy user's Jade files from 6004x to src/files, where they are accessed by server_local.cgi:
files:
	- mkdir src/files
	scp -r 6004X.csail.mit.edu:jade/libraries/$(USERDIR)/* src/files/
	chmod 777 src/files src/files/*


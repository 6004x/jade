# Makefile for Jade subtree

analog.js: files/analog
	python icon_only.py files/analog analog.js

gates.js: files/gates
	python icon_only.py files/gates gates.js

edx:	analog.js gates.js
	grunt jade_edx
	cp build/FontAwesome.otf build/fontawesome-webfont.* ~/git/6.004/mitx/static/
	cp build/jade_edx.min.js build/jade.css ~/git/6.004/mitx/static/labs/
	rm jade_edx.zip; zip -j jade_edx.zip build/jade_edx.min.js build/jade.css build/FontAwesome.otf build/fontawesome-webfont.*

standalone: analog.js gates.js
	rm build/*
	grunt jade
	zip -rj jade.zip build

workbook: analog.js gates.js
	grunt jade_workbook
	cp build/jade_workbook.html build/jade_workbook.min.js build/jade.css build/FontAwesome.otf build/fontawesome-webfont.* ~/git/6.004/6004x.github.io/tools/

labs:	analog.js gates.js
	grunt jade_6004
	cp build/jade_6004.html build/jade_6004.min.js build/jade.css build/FontAwesome.otf build/fontawesome-webfont.* ../6.004/labs/ssldocs/coursewarex/

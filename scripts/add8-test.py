
from testvecutils import *

title = """
// Test vectors for 4-bit combinational adder
"""

w=8

# print header for a line:
def head():
    print "//", hd(" AAAAAAAA", w), hd("BBBBBBBB", w), "C", hd("SSSSSSSS", w), "C"

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(a, b, cin):
    s = a+b+cin
    cout = (a+b+cin) >> w
    print "  ", bin(a, w), bin(b, w), bin(cin, 1), lh(s, w), lh(cout, 1)

def doit():
    print title
    head()

    mask = (1<<w)-1

    for cin in range(2):

        for bitpos in range(w):
            a = 1 << bitpos
            abar = a ^  mask
            trycase(a, a, cin)
            trycase(a, abar, cin)
            trycase(abar, 1, cin)

doit()


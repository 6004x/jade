
from testvecutils import *

title = """
// Test vectors for 4-bit combinational adder
"""

w=4

# print header for a line:
def head():
    print "//", hd(" AAAA", w), hd("BBBB", w), "C", hd("SSSS", w), "C"

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


    for a in range(1<<w):
        for b in range(1<<w):
            trycase(a, b, 0)
    for a in range(1<<w):
        for b in range(1<<w):
            trycase(a, b, 1)
doit()


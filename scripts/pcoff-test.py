
from testvecutils import *

title = """
// Test vectors for 16-bit offset adder to 29-bit Beta PC
"""

w=32

# print header for a line:
def head():
    print "//", hd(" PC[31:2] ", 30), hd(" Off[15:0] ", 16), hd(" BT[31:2] ", 30)

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(pc, off):
    s = (pc+off) & 0x3FFFFFFF
    print "  ", bin(pc, 30), bin(off, 16), bin(s, 30)

def doit():
    print title
    head()

    off_cases = [ 0, 1, -1, 2, -2, (1<<15)-1, -1 << 15, 37, -37 ] + [1 << x for x in range(15)]
    pc_cases = [0, 1, 2, 3, 0x1234567] + [1<<x for x in range(29)]

    for off in off_cases:
        for pc in pc_cases:
            trycase(pc, off)

doit()


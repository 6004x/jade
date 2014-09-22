
from testvecutils import *

title = """
// Test vectors for Beta ALU shifter subsystem

"""


# Some globals:


# print header for a line:
def head():

    # inputs:
    print "// ", hd("Fn", 2), hd(" A[31:0] ", 32), hd(" B ", 5),

    # outputs:
    print hd(" Y[31:0] ", 32)



# Generate a test case.
# Args can be integer values, or '-' for undefined.
# Updates global PC to npc value.
def trycase(A, B, Fn):
    
    print "   ", bin(Fn, 2), bin(A, 32), bin(B, 5),
    
    if Fn == 0:                         # SHL
        Y = (A << (B & 0x1F)) & 0xFFFFFFFF

    elif Fn == 1:                       # SHR
        Y = ((A & 0xFFFFFFFF) >> (B & 0x1F)) & 0xFFFFFFFF

    elif Fn == 3:                       # SAR
        # Convert A to signed integer:
        if A & 0x80000000: A |= (-1 << 31) 
        Y = (A >> (B & 0x1F)) & 0xFFFFFFFF

    else:
        Y = -1

    print lh(Y, 32)


def doit():
    
    print title
    head()

    acases = [0x0, 0x1, 5, 0xFFFFFFFF, 0xFFFFFFFE];
    bcases = [0, 1, 2, 4, 5, 15, 31 ]


    cmt("SHL tests")
    for a in acases:
        for b in bcases:
            trycase(a, b, 0)

    cmt("SHR tests")
    for a in acases:
        for b in bcases:
            trycase(a, b, 1)

    cmt("SAR tests")
    for a in acases:
        for b in bcases:
            trycase(a, b, 3)


doit()


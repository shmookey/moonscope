Ratite: An Introduction
=======================

If you are reading this document today, you are probably a colleague, friend,
or someone from the WebGPU community who has clicked on my GitHub profile. Let
us say we are friends. Well, friend, you have stumbled upon a document which is
unfinished and probably inaccurate. It describes my aims and intentions as much
as it does reality. As I develop this project and it becomes more complex, it
is helpful for me to set things out in words. My hope is that in time I can
adapt this into real documentation. Nevertheless, if you are interested in the
project, this will probably be the best way of learning about it.


## Language and conventions

Ratite is mostly written in TypeScript, strict mode off, with a few CLI scripts
in plain JavaScript because it was more convenient than putting them in a
separate project or figuring out how to configure the TypeScript compiler for
a project in which some parts target the web platform and others target node.

I would suggest using TypeScript for Ratite projects, if it is convenient to do
so. Apart from helping to prevent certain types of programming error, the types
are an invaluable source of documentation; in some cases, the only source. I
would also encourage you to read the source code, which contains a lot of useful
commentary on how and why things work the way that they do.


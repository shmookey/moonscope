Ratite - Rendering system for birds
===================================

Ratite is a rendering system for birds. It is designed to be used primarily by
birds but also people who want to develop 3D applications for the web using
WebGPU. It is a work in progress and is not yet ready for production use, but
even if it was, WebGPU isn't, so you're not missing out on anything.

If I'm being honest, it's not really even ready to be looked at yet, but here
we are. 

Development is currently driven by the needs of the [Moonscope][moonscope]
project, from which it was extracted. It is designed to be less gigantic and
all-encompassing than a typical graphics engine; it is more "library" than
"framework", there is no inversion of control or behind-the-scenes magic, and
little abstraction. It features a scene graph implementation, resource loading,
flexible rendering pipelines and a few other things. It is capable of rendering
scenes with very high spatial dynamic range, you can model the solar system to
scale and still have enough precision to place small objects on the surface of
the Earth. In fact, this is what it was designed for.

There are no instructions or documentation yet. Major aspects of the API (such
as it is) are subject to change, though the pace of change to core components
is slowing down. In a few months, there may just be something worth looking at.

Thanks for your interest!

// A dedicated ordinary Worker owns this module; it is not an Emscripten pthread.
// Samsung's non-pthread socket fcntl path still reads this runtime flag.
var ENVIRONMENT_IS_PTHREAD = false;

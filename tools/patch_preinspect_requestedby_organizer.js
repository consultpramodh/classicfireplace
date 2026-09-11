#!/usr/bin/env node
'use strict';

// Compatibility wrapper for the standard ZIP/CMD package naming.
// The canonical patch implementation remains the existing hyphenated file.
require('./patch-preinspect-requestedby-organizer.js');

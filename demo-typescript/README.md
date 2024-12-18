# Numeno TypeScript API Demo

This repo demonstrates the use of Numeno in TypeScript.

It walks you through how to administer Keys and Scopes, create Feeds and manipulate Streams, and fetch Artciles, all with the Numeno TypeScript API Libraries.

## Installation & Usage

Requires [Node.js](https://nodejs.org/en/download/) version 18.0 or above:

- When installing Node.js, you are recommended to check all checkboxes related to dependencies.

### Install Dependencies

After cloning the repo, install Node if necessary, then install dependencies:

```sh
$ npm install        # Install dependencies for this project.
```

### Set up the Environment

Duplicate the file `.env.example` and rename it to `.env`. Populate this new file with values for your setup. Access your Numeno Keys from the [Numeno Dashboard](https://numeno.ai/under-construction/) or contact your team admin.

### Running the Script

Run the script from the commandline using [tsx](https://tsx.is/):

```sh
$ npm tsx ./numeno-api.demo.ts
```


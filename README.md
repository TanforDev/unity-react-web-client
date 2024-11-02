
# Unity WebGL Client

A web client built with **React.js** and **Vite** to host and run Unity WebGL builds seamlessly. This client utilizes the [react-unity-webgl](https://github.com/elraccoone/react-unity-webgl) library to integrate Unity games directly into a React environment, providing a smooth and interactive experience on the web.

## Features

- **Unity WebGL Integration**: Load and run Unity WebGL builds within a React.js app.
- **Responsive UI**: Designed to adapt to different screen sizes and orientations.
- **Fast Development**: Uses Vite for rapid development and fast builds.
- **Easy Deployment**: Optimized for production, allowing smooth deployment on any static hosting provider.

## Technologies

- **React.js**: Frontend framework for building a responsive user interface.
- **Vite**: Fast and modern build tool for rapid development.
- **react-unity-webgl**: Library for embedding and controlling Unity WebGL builds in React apps.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or higher)
- [Unity](https://unity.com/) with WebGL build support installed

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/TanforDev/unity-react-web-client.git
   cd unity-react-web-client
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Place your Unity WebGL build in the `public/Build` directory. The folder structure should look like this:

   ```plaintext
   public/
   └── Build/
      ├── public.data
      ├── public.framework.js
      ├── public.loader.js
      └── public.wasm
   ```

### Running the Development Server

Start the Vite development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

### Building for Production

To create an optimized production build:

```bash
npm run build
```

This will generate the `dist` directory with a production-ready version of your app. You can deploy this folder to any static hosting provider.

## Usage

The Unity WebGL game will load automatically from the specified path in `public/Build`. The `react-unity-webgl` library provides hooks and props for controlling the Unity instance, allowing for flexible and interactive integration.

## Available Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the project for production.
- `npm run preview`: Serves the production build for preview.

## Configuration

You may customize the path and other settings in `App.js` if additional configuration is needed for loading specific Unity builds.

## Contributing

Feel free to submit issues or pull requests to improve the project. For major changes, please open an issue first to discuss what you'd like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

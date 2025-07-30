// components/ui/Loader.tsx

import React from "react";

const Loader: React.FC = () => {
  return (
    <div className="flex justify-center items-center py-6">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent border-blue-600" />
    </div>
  );
};

export default Loader;
import React from "react";

interface LoaderProps {
  label?: string;
}

export default function Loader({ label = "Loading..." }: LoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-gray-800 mb-2" />
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}